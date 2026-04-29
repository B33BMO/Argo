import { readFile } from 'fs/promises';
import { glob } from 'glob';
import { resolve, isAbsolute } from 'path';
import type { Tool, ToolContext, ToolResult, ValidationResult } from './types.js';
import { validInput, invalidInput } from './types.js';
import { SENSITIVE_GLOB_IGNORES, isSensitivePath, redactSecrets } from '../utils/secrets.js';

const MAX_MATCHES = 100;
const MAX_LINE_LENGTH = 200;

interface GrepParams {
  pattern: string;
  path?: string;
  include?: string;
  ignore_case?: boolean;
}

interface Match {
  file: string;
  line: number;
  content: string;
}

function validateParams(params: Record<string, unknown>): ValidationResult {
  if (typeof params.pattern !== 'string' || params.pattern.trim() === '') {
    return invalidInput('pattern must be a non-empty string');
  }
  if (params.path !== undefined && typeof params.path !== 'string') {
    return invalidInput('path must be a string');
  }
  if (params.include !== undefined && typeof params.include !== 'string') {
    return invalidInput('include must be a string');
  }
  if (params.ignore_case !== undefined && typeof params.ignore_case !== 'boolean') {
    return invalidInput('ignore_case must be a boolean');
  }
  // Validate regex pattern
  try {
    new RegExp(params.pattern as string);
  } catch {
    return invalidInput(`Invalid regex pattern: ${params.pattern}`);
  }
  return validInput(params as Record<string, unknown>);
}

export const grepTool: Tool = {
  name: 'grep',
  description:
    'Search for a pattern in files. Supports regex patterns. Returns matching lines with file paths and line numbers.',
  parameters: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'Regular expression pattern to search for',
      },
      path: {
        type: 'string',
        description: 'File or directory to search in (defaults to current directory)',
      },
      include: {
        type: 'string',
        description: 'Glob pattern to filter files (e.g., "*.ts", "**/*.js")',
      },
      ignore_case: {
        type: 'boolean',
        description: 'Case insensitive search (default: false)',
      },
    },
    required: ['pattern'],
  },

  isReadOnly: () => true,

  validateInput: validateParams,

  async execute(
    params: Record<string, unknown>,
    context: ToolContext
  ): Promise<ToolResult> {
    const { pattern, path: searchPath, include = '**/*', ignore_case: ignoreCase = false } = params as unknown as GrepParams;

    const cwd = searchPath
      ? isAbsolute(searchPath)
        ? searchPath
        : resolve(context.cwd, searchPath)
      : context.cwd;

    try {
      const regex = new RegExp(pattern, ignoreCase ? 'gi' : 'g');

      // Find files to search — sensitive files are excluded so contents
      // never leak into grep output.
      const files = (await glob(include, {
        cwd,
        absolute: true,
        nodir: true,
        ignore: ['**/node_modules/**', '**/.git/**', '**/dist/**', ...SENSITIVE_GLOB_IGNORES],
      })).filter(p => !isSensitivePath(p));

      const matches: Match[] = [];
      let truncated = false;

      for (const file of files) {
        if (matches.length >= MAX_MATCHES) {
          truncated = true;
          break;
        }

        try {
          const content = await readFile(file, 'utf-8');
          const lines = content.split('\n');

          for (let i = 0; i < lines.length; i++) {
            if (regex.test(lines[i])) {
              let lineContent = lines[i];
              if (lineContent.length > MAX_LINE_LENGTH) {
                lineContent = lineContent.slice(0, MAX_LINE_LENGTH) + '...';
              }
              // Defense in depth: scrub matched lines that contain secret-like values.
              lineContent = redactSecrets(lineContent).output;

              matches.push({
                file: file.replace(cwd + '/', ''),
                line: i + 1,
                content: lineContent.trim(),
              });

              if (matches.length >= MAX_MATCHES) {
                truncated = true;
                break;
              }
            }
            // Reset regex lastIndex for global patterns
            regex.lastIndex = 0;
          }
        } catch {
          // Skip binary files or unreadable files
          continue;
        }
      }

      if (matches.length === 0) {
        return {
          success: true,
          output: `No matches found for pattern: ${pattern}`,
        };
      }

      const output = matches
        .map((m) => `${m.file}:${m.line}: ${m.content}`)
        .join('\n');

      return {
        success: true,
        output:
          output +
          (truncated
            ? `\n\n... (showing first ${MAX_MATCHES} matches)`
            : `\n\nFound ${matches.length} match(es)`),
        truncated,
      };
    } catch (err) {
      const error = err as Error;
      return {
        success: false,
        output: '',
        error: error.message || 'Failed to search',
      };
    }
  },
};
import { readFile } from 'fs/promises';
import { glob } from 'glob';
import { resolve, isAbsolute } from 'path';
import type { Tool, ToolContext, ToolResult } from './types.js';
import { SENSITIVE_GLOB_IGNORES, isSensitivePath, redactSecrets } from '../utils/secrets.js';

const MAX_MATCHES = 100;
const MAX_LINE_LENGTH = 200;

interface Match {
  file: string;
  line: number;
  content: string;
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

  async execute(
    params: Record<string, unknown>,
    context: ToolContext
  ): Promise<ToolResult> {
    const pattern = params.pattern as string;
    const searchPath = params.path as string | undefined;
    const include = (params.include as string) || '**/*';
    const ignoreCase = (params.ignore_case as boolean) || false;

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
      if (error.message.includes('Invalid regular expression')) {
        return {
          success: false,
          output: '',
          error: `Invalid regex pattern: ${pattern}`,
        };
      }
      return {
        success: false,
        output: '',
        error: error.message || 'Failed to search',
      };
    }
  },
};

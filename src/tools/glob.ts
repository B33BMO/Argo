import { glob } from 'glob';
import { resolve, isAbsolute } from 'path';
import type { Tool, ToolContext, ToolResult } from './types.js';
import { SENSITIVE_GLOB_IGNORES, isSensitivePath } from '../utils/secrets.js';

const MAX_RESULTS = 500;

export const globTool: Tool = {
  name: 'glob',
  description:
    'Find files matching a glob pattern. Useful for discovering files in a project, finding files by extension, or locating specific file names.',
  parameters: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description:
          'Glob pattern to match (e.g., "**/*.ts", "src/**/*.js", "*.json")',
      },
      path: {
        type: 'string',
        description: 'Base directory to search in (defaults to current directory)',
      },
    },
    required: ['pattern'],
  },

  async execute(
    params: Record<string, unknown>,
    context: ToolContext
  ): Promise<ToolResult> {
    const pattern = params.pattern as string;
    const basePath = params.path as string | undefined;

    const cwd = basePath
      ? isAbsolute(basePath)
        ? basePath
        : resolve(context.cwd, basePath)
      : context.cwd;

    try {
      const matches = (await glob(pattern, {
        cwd,
        absolute: false,
        nodir: true,
        ignore: ['**/node_modules/**', '**/.git/**', ...SENSITIVE_GLOB_IGNORES],
        maxDepth: 20,
      })).filter(p => !isSensitivePath(p));

      if (matches.length === 0) {
        return {
          success: true,
          output: `No files found matching pattern: ${pattern}`,
        };
      }

      // Sort by path
      matches.sort();

      let truncated = false;
      let resultList = matches;

      if (matches.length > MAX_RESULTS) {
        resultList = matches.slice(0, MAX_RESULTS);
        truncated = true;
      }

      let output = resultList.join('\n');

      if (truncated) {
        output += `\n\n... and ${matches.length - MAX_RESULTS} more files (${matches.length} total)`;
      } else {
        output += `\n\nFound ${matches.length} file(s)`;
      }

      return {
        success: true,
        output,
        truncated,
      };
    } catch (err) {
      const error = err as Error;
      return {
        success: false,
        output: '',
        error: error.message || 'Failed to search files',
      };
    }
  },
};

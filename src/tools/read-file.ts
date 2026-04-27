import { readFile } from 'fs/promises';
import { resolve, isAbsolute } from 'path';
import type { Tool, ToolContext, ToolResult } from './types.js';

const MAX_OUTPUT_LENGTH = 100000;
const MAX_LINES = 2000;

export const readFileTool: Tool = {
  name: 'read_file',
  description:
    'Read the contents of a file. Can read entire files or specific line ranges for large files.',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the file to read (relative or absolute)',
      },
      offset: {
        type: 'number',
        description: 'Line number to start reading from (1-based, default: 1)',
      },
      limit: {
        type: 'number',
        description: `Maximum number of lines to read (default: ${MAX_LINES})`,
      },
    },
    required: ['path'],
  },

  async execute(
    params: Record<string, unknown>,
    context: ToolContext
  ): Promise<ToolResult> {
    const filePath = params.path as string;
    const offset = ((params.offset as number) || 1) - 1; // Convert to 0-based
    const limit = (params.limit as number) || MAX_LINES;

    const absolutePath = isAbsolute(filePath)
      ? filePath
      : resolve(context.cwd, filePath);

    try {
      const content = await readFile(absolutePath, 'utf-8');
      const lines = content.split('\n');
      const totalLines = lines.length;

      // Apply offset and limit
      const selectedLines = lines.slice(offset, offset + limit);
      let output = selectedLines
        .map((line, i) => `${(offset + i + 1).toString().padStart(6)}\t${line}`)
        .join('\n');

      let truncated = false;
      const info: string[] = [];

      if (offset > 0 || offset + limit < totalLines) {
        info.push(
          `Showing lines ${offset + 1}-${Math.min(offset + limit, totalLines)} of ${totalLines}`
        );
        truncated = true;
      }

      if (output.length > MAX_OUTPUT_LENGTH) {
        output =
          output.slice(0, MAX_OUTPUT_LENGTH) + '\n... (output truncated)';
        truncated = true;
      }

      if (info.length > 0) {
        output = info.join('\n') + '\n\n' + output;
      }

      return {
        success: true,
        output,
        truncated,
      };
    } catch (err) {
      const error = err as NodeJS.ErrnoException;
      if (error.code === 'ENOENT') {
        return {
          success: false,
          output: '',
          error: `File not found: ${absolutePath}`,
        };
      }
      if (error.code === 'EISDIR') {
        return {
          success: false,
          output: '',
          error: `Path is a directory, not a file: ${absolutePath}`,
        };
      }
      return {
        success: false,
        output: '',
        error: error.message || 'Failed to read file',
      };
    }
  },
};

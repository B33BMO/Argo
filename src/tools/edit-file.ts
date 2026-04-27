import { readFile, writeFile } from 'fs/promises';
import { resolve, isAbsolute } from 'path';
import type { Tool, ToolContext, ToolResult } from './types.js';

export const editFileTool: Tool = {
  name: 'edit_file',
  description:
    'Edit a file by replacing a specific string with another. The old_string must match exactly (including whitespace and indentation). Use this for making precise edits to existing files.',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the file to edit (relative or absolute)',
      },
      old_string: {
        type: 'string',
        description:
          'The exact string to find and replace. Must be unique in the file.',
      },
      new_string: {
        type: 'string',
        description: 'The string to replace it with',
      },
      replace_all: {
        type: 'boolean',
        description: 'Replace all occurrences instead of just the first (default: false)',
      },
    },
    required: ['path', 'old_string', 'new_string'],
  },

  async execute(
    params: Record<string, unknown>,
    context: ToolContext
  ): Promise<ToolResult> {
    const filePath = params.path as string;
    const oldString = params.old_string as string;
    const newString = params.new_string as string;
    const replaceAll = (params.replace_all as boolean) || false;

    const absolutePath = isAbsolute(filePath)
      ? filePath
      : resolve(context.cwd, filePath);

    try {
      const content = await readFile(absolutePath, 'utf-8');

      // Count occurrences
      const occurrences = content.split(oldString).length - 1;

      if (occurrences === 0) {
        return {
          success: false,
          output: '',
          error: `String not found in file: "${oldString.slice(0, 100)}${oldString.length > 100 ? '...' : ''}"`,
        };
      }

      if (occurrences > 1 && !replaceAll) {
        return {
          success: false,
          output: '',
          error: `Found ${occurrences} occurrences of the string. Use replace_all: true to replace all, or provide more context to make the string unique.`,
        };
      }

      // Perform replacement
      let newContent: string;
      let replacedCount: number;

      if (replaceAll) {
        newContent = content.split(oldString).join(newString);
        replacedCount = occurrences;
      } else {
        newContent = content.replace(oldString, newString);
        replacedCount = 1;
      }

      await writeFile(absolutePath, newContent, 'utf-8');

      return {
        success: true,
        output: `Successfully replaced ${replacedCount} occurrence(s) in ${absolutePath}`,
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
      return {
        success: false,
        output: '',
        error: error.message || 'Failed to edit file',
      };
    }
  },
};

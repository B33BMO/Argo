import { readFile, writeFile } from 'fs/promises';
import { resolve, isAbsolute } from 'path';
import type { Tool, ToolContext, ToolResult, ValidationResult } from './types.js';
import { validInput, invalidInput } from './types.js';
import { loadPermissions, isWritePathAllowed, allowWritePath } from '../utils/permissions.js';

interface EditFileParams {
  path: string;
  old_string: string;
  new_string: string;
  replace_all?: boolean;
}

function validateParams(params: Record<string, unknown>): ValidationResult {
  if (typeof params.path !== 'string' || params.path.trim() === '') {
    return invalidInput('path must be a non-empty string');
  }
  if (typeof params.old_string !== 'string') {
    return invalidInput('old_string must be a string');
  }
  if (params.old_string.trim() === '') {
    return invalidInput('old_string cannot be empty');
  }
  if (typeof params.new_string !== 'string') {
    return invalidInput('new_string must be a string');
  }
  if (params.replace_all !== undefined && typeof params.replace_all !== 'boolean') {
    return invalidInput('replace_all must be a boolean');
  }
  return validInput(params as Record<string, unknown>);
}

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

  isReadOnly: () => false,

  validateInput: validateParams,

  async execute(
    params: Record<string, unknown>,
    context: ToolContext
  ): Promise<ToolResult> {
    const { path: filePath, old_string: oldString, new_string: newString, replace_all: replaceAll } = params as unknown as EditFileParams;

    const absolutePath = isAbsolute(filePath)
      ? filePath
      : resolve(context.cwd, filePath);

    // Check permissions
    const permissions = await loadPermissions();
    const isAllowed = isWritePathAllowed(permissions, absolutePath);

    if (!isAllowed && context.requestConfirmation) {
      const confirmed = await context.requestConfirmation(
        `Edit file: ${absolutePath}?\n\nReplace "${oldString.slice(0, 50)}${oldString.length > 50 ? '...' : ''}"?`
      );
      if (!confirmed) {
        return {
          success: false,
          output: '',
          error: 'File edit cancelled by user',
        };
      }
      await allowWritePath(absolutePath);
    }

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
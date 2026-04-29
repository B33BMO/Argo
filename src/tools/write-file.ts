import { writeFile, mkdir, access, constants } from 'fs/promises';
import { resolve, isAbsolute, dirname } from 'path';
import type { Tool, ToolContext, ToolResult, ValidationResult } from './types.js';
import { validInput, invalidInput } from './types.js';
import { isInsideArgoHome } from '../utils/workspace.js';
import { 
  loadPermissions, 
  isWritePathAllowed, 
  allowWritePath 
} from '../utils/permissions.js';

interface WriteFileParams {
  path: string;
  content: string;
}

function validateParams(params: Record<string, unknown>): ValidationResult {
  if (typeof params.path !== 'string' || params.path.trim() === '') {
    return invalidInput('path must be a non-empty string');
  }
  if (typeof params.content !== 'string') {
    return invalidInput('content must be a string');
  }
  return validInput(params as Record<string, unknown>);
}

export const writeFileTool: Tool = {
  name: 'write_file',
  description:
    'Write content to a file. Creates the file if it does not exist, or overwrites it if it does. Creates parent directories as needed.',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the file to write (relative or absolute)',
      },
      content: {
        type: 'string',
        description: 'Content to write to the file',
      },
    },
    required: ['path', 'content'],
  },

  isReadOnly: () => false,

  validateInput: validateParams,

  async execute(
    params: Record<string, unknown>,
    context: ToolContext
  ): Promise<ToolResult> {
    const { path: filePath, content } = params as unknown as WriteFileParams;

    const absolutePath = isAbsolute(filePath)
      ? filePath
      : resolve(context.cwd, filePath);

    // Safety: refuse to write inside ~/.argo (would clobber soul, sessions, etc)
    if (isInsideArgoHome(absolutePath)) {
      return {
        success: false,
        output: '',
        error: `Refusing to write inside ~/.argo (Argo's runtime data). Path: ${absolutePath}`,
      };
    }

    // Check permissions
    const permissions = await loadPermissions();
    const isAllowed = isWritePathAllowed(permissions, absolutePath);

    if (!isAllowed && context.requestConfirmation) {
      const confirmed = await context.requestConfirmation(
        `Write to file: ${absolutePath}?\n\nThis will ${await checkFileExists(absolutePath) ? 'overwrite' : 'create'} the file.`
      );
      if (!confirmed) {
        return {
          success: false,
          output: '',
          error: 'File write cancelled by user',
        };
      }
      // Remember permission for this session
      await allowWritePath(absolutePath);
    }

    try {
      // Ensure parent directory exists
      const dir = dirname(absolutePath);
      await mkdir(dir, { recursive: true });

      // Write the file
      await writeFile(absolutePath, content, 'utf-8');

      const lines = content.split('\n').length;
      const bytes = Buffer.byteLength(content, 'utf-8');

      return {
        success: true,
        output: `Successfully wrote ${bytes} bytes (${lines} lines) to ${absolutePath}`,
      };
    } catch (err) {
      const error = err as NodeJS.ErrnoException;
      return {
        success: false,
        output: '',
        error: error.message || 'Failed to write file',
      };
    }
  },
};

async function checkFileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}
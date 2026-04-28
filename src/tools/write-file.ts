import { writeFile, mkdir, access, constants } from 'fs/promises';
import { resolve, isAbsolute, dirname } from 'path';
import type { Tool, ToolContext, ToolResult } from './types.js';
import { isInsideArgoHome } from '../utils/workspace.js';

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

  async execute(
    params: Record<string, unknown>,
    context: ToolContext
  ): Promise<ToolResult> {
    const filePath = params.path as string;
    const content = params.content as string;

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

    // Check if file exists (for confirmation on new files)
    let isNewFile = false;
    try {
      await access(absolutePath, constants.F_OK);
    } catch {
      isNewFile = true;
    }

    // Request confirmation for new files if configured
    if (isNewFile && context.requestConfirmation) {
      const confirmed = await context.requestConfirmation(
        `Create new file: ${absolutePath}?`
      );
      if (!confirmed) {
        return {
          success: false,
          output: '',
          error: 'File creation cancelled by user',
        };
      }
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

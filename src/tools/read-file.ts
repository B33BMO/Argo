import { readFile } from 'fs/promises';
import { resolve, isAbsolute } from 'path';
import type { Tool, ToolContext, ToolResult, ValidationResult } from './types.js';
import { validInput, invalidInput } from './types.js';
import {
  isSensitivePath,
  requestSensitiveAccess,
  redactSecrets,
  sensitiveDenialMessage,
} from '../utils/secrets.js';

const MAX_OUTPUT_LENGTH = 100000;
const MAX_LINES = 2000;

interface ReadFileParams {
  path: string;
  offset?: number;
  limit?: number;
}

function validateParams(params: Record<string, unknown>): ValidationResult {
  if (typeof params.path !== 'string' || params.path.trim() === '') {
    return invalidInput('path must be a non-empty string');
  }
  if (params.offset !== undefined && typeof params.offset !== 'number') {
    return invalidInput('offset must be a number');
  }
  if (params.limit !== undefined && typeof params.limit !== 'number') {
    return invalidInput('limit must be a number');
  }
  return validInput(params as Record<string, unknown>);
}

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
        description: `Line number to start reading from (1-based, default: 1)`,
      },
      limit: {
        type: 'number',
        description: `Maximum number of lines to read (default: ${MAX_LINES})`,
      },
    },
    required: ['path'],
  },

  isReadOnly: () => true,

  validateInput: validateParams,

  async execute(
    params: Record<string, unknown>,
    context: ToolContext
  ): Promise<ToolResult> {
    const { path: filePath, offset = 1, limit = MAX_LINES } = params as unknown as ReadFileParams;
    const lineOffset = offset - 1; // Convert to 0-based

    const absolutePath = isAbsolute(filePath)
      ? filePath
      : resolve(context.cwd, filePath);

    // Sensitive-files guard — refuse silently unless the user explicitly approves.
    if (isSensitivePath(absolutePath)) {
      const allow = await requestSensitiveAccess(context, absolutePath, 'Read');
      if (!allow) {
        return { success: false, output: '', error: sensitiveDenialMessage(filePath) };
      }
    }

    try {
      const rawContent = await readFile(absolutePath, 'utf-8');
      const { output: scrubbed, redactions } = redactSecrets(rawContent);
      const content = scrubbed;
      const lines = content.split('\n');
      const totalLines = lines.length;

      // Apply offset and limit
      const selectedLines = lines.slice(lineOffset, lineOffset + limit);
      let output = selectedLines
        .map((line, i) => `${(lineOffset + i + 1).toString().padStart(6)}\t${line}`)
        .join('\n');

      let truncated = false;
      const info: string[] = [];

      if (lineOffset > 0 || lineOffset + limit < totalLines) {
        info.push(
          `Showing lines ${lineOffset + 1}-${Math.min(lineOffset + limit, totalLines)} of ${totalLines}`
        );
        truncated = true;
      }

      if (output.length > MAX_OUTPUT_LENGTH) {
        output =
          output.slice(0, MAX_OUTPUT_LENGTH) + '\n... (output truncated)';
        truncated = true;
      }

      if (redactions > 0) {
        info.push(`Auto-redacted ${redactions} value(s) that looked like secrets.`);
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
import { readdir, stat } from 'fs/promises';
import { resolve, isAbsolute, join } from 'path';
import type { Tool, ToolContext, ToolResult } from './types.js';

interface FileInfo {
  name: string;
  type: 'file' | 'directory';
  size?: number;
}

export const listDirTool: Tool = {
  name: 'list_dir',
  description:
    'List the contents of a directory. Shows files and subdirectories with their types and sizes.',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the directory to list (defaults to current directory)',
      },
      show_hidden: {
        type: 'boolean',
        description: 'Include hidden files (files starting with .) (default: false)',
      },
    },
    required: [],
  },

  async execute(
    params: Record<string, unknown>,
    context: ToolContext
  ): Promise<ToolResult> {
    const dirPath = (params.path as string) || '.';
    const showHidden = (params.show_hidden as boolean) || false;

    const absolutePath = isAbsolute(dirPath)
      ? dirPath
      : resolve(context.cwd, dirPath);

    try {
      const entries = await readdir(absolutePath, { withFileTypes: true });

      const fileInfos: FileInfo[] = [];

      for (const entry of entries) {
        // Skip hidden files unless requested
        if (!showHidden && entry.name.startsWith('.')) {
          continue;
        }

        const info: FileInfo = {
          name: entry.name,
          type: entry.isDirectory() ? 'directory' : 'file',
        };

        // Get file size for regular files
        if (entry.isFile()) {
          try {
            const stats = await stat(join(absolutePath, entry.name));
            info.size = stats.size;
          } catch {
            // Ignore stat errors
          }
        }

        fileInfos.push(info);
      }

      // Sort: directories first, then alphabetically
      fileInfos.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'directory' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });

      if (fileInfos.length === 0) {
        return {
          success: true,
          output: `Directory is empty: ${absolutePath}`,
        };
      }

      const formatSize = (bytes?: number): string => {
        if (bytes === undefined) return '';
        if (bytes < 1024) return `${bytes}B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
        if (bytes < 1024 * 1024 * 1024)
          return `${(bytes / 1024 / 1024).toFixed(1)}M`;
        return `${(bytes / 1024 / 1024 / 1024).toFixed(1)}G`;
      };

      const output = fileInfos
        .map((f) => {
          const prefix = f.type === 'directory' ? '[DIR] ' : '      ';
          const size = f.size !== undefined ? ` (${formatSize(f.size)})` : '';
          return `${prefix}${f.name}${size}`;
        })
        .join('\n');

      return {
        success: true,
        output:
          output +
          `\n\n${fileInfos.filter((f) => f.type === 'directory').length} directories, ${fileInfos.filter((f) => f.type === 'file').length} files`,
      };
    } catch (err) {
      const error = err as NodeJS.ErrnoException;
      if (error.code === 'ENOENT') {
        return {
          success: false,
          output: '',
          error: `Directory not found: ${absolutePath}`,
        };
      }
      if (error.code === 'ENOTDIR') {
        return {
          success: false,
          output: '',
          error: `Path is not a directory: ${absolutePath}`,
        };
      }
      return {
        success: false,
        output: '',
        error: error.message || 'Failed to list directory',
      };
    }
  },
};

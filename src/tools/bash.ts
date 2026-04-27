import { exec } from 'child_process';
import { promisify } from 'util';
import type { Tool, ToolContext, ToolResult } from './types.js';

const execAsync = promisify(exec);

const MAX_OUTPUT_LENGTH = 50000;

export const bashTool: Tool = {
  name: 'bash',
  description:
    'Execute a bash command in the shell. Use this for running commands, installing packages, git operations, and other terminal tasks.',
  parameters: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'The bash command to execute',
      },
      timeout: {
        type: 'number',
        description: 'Timeout in milliseconds (default: 30000)',
        default: 30000,
      },
      cwd: {
        type: 'string',
        description: 'Working directory for the command (defaults to current directory)',
      },
    },
    required: ['command'],
  },

  async execute(
    params: Record<string, unknown>,
    context: ToolContext
  ): Promise<ToolResult> {
    const command = params.command as string;
    const timeout = (params.timeout as number) || 30000;
    const cwd = (params.cwd as string) || context.cwd;

    // Check for potentially dangerous commands
    const dangerousPatterns = [
      /\brm\s+(-rf?|--recursive)\s+[\/~]/i,
      /\bsudo\b/i,
      /\bmkfs\b/i,
      /\bdd\s+if=/i,
      />\s*\/dev\//i,
    ];

    const isDangerous = dangerousPatterns.some((pattern) =>
      pattern.test(command)
    );

    if (isDangerous && context.requestConfirmation) {
      const confirmed = await context.requestConfirmation(
        `This command looks potentially dangerous:\n${command}\n\nDo you want to proceed?`
      );
      if (!confirmed) {
        return {
          success: false,
          output: '',
          error: 'Command execution cancelled by user',
        };
      }
    }

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd,
        timeout,
        maxBuffer: 1024 * 1024 * 10, // 10MB
        env: { ...process.env, ...context.env },
      });

      let output = stdout + (stderr ? `\nstderr:\n${stderr}` : '');
      let truncated = false;

      if (output.length > MAX_OUTPUT_LENGTH) {
        output = output.slice(0, MAX_OUTPUT_LENGTH) + '\n... (output truncated)';
        truncated = true;
      }

      return {
        success: true,
        output,
        truncated,
      };
    } catch (err) {
      const error = err as { stdout?: string; stderr?: string; message?: string; code?: number };

      let output = '';
      if (error.stdout) output += error.stdout;
      if (error.stderr) output += (output ? '\n' : '') + error.stderr;

      return {
        success: false,
        output,
        error: error.message || 'Command failed',
      };
    }
  },
};

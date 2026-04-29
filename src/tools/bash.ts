import type { Tool, ToolContext, ToolResult, ValidationResult } from './types.js';
import { validInput, invalidInput } from './types.js';
import { sessionRegistry } from '../sessions/shell.js';
import { bashLooksSecretFishing, redactSecrets } from '../utils/secrets.js';
import { loadPermissions, isCommandAllowed, allowCommand, isSafeCommand } from '../utils/permissions.js';

const MAX_OUTPUT_LENGTH = 50000;

interface BashParams {
  command: string;
  timeout?: number;
}

function validateParams(params: Record<string, unknown>): ValidationResult {
  if (typeof params.command !== 'string' || params.command.trim() === '') {
    return invalidInput('command must be a non-empty string');
  }
  if (params.timeout !== undefined) {
    if (typeof params.timeout !== 'number') {
      return invalidInput('timeout must be a number');
    }
    if (params.timeout < 1000) {
      return invalidInput('timeout must be at least 1000ms');
    }
  }
  return validInput(params as Record<string, unknown>);
}

export const bashTool: Tool = {
  name: 'bash',
  description:
    'Execute a bash command in the active shell session. The active session may be local OR a remote SSH session — check the system context for which. Commands persist state (cwd, env vars, etc) within the active session across calls.',
  parameters: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'The bash command to execute in the active shell session',
      },
      timeout: {
        type: 'number',
        description: 'Timeout in milliseconds (default: 120000)',
        default: 120000,
      },
    },
    required: ['command'],
  },

  isReadOnly: () => false,

  validateInput: validateParams,

  async execute(
    params: Record<string, unknown>,
    context: ToolContext
  ): Promise<ToolResult> {
    const { command, timeout = 120000 } = params as unknown as BashParams;

    // Check for dangerous patterns
    const dangerousPatterns = [
      /\brm\s+(-rf?|--recursive)\s+[\/~]/i,
      /\bsudo\s+rm\b/i,
      /\bmkfs\b/i,
      /\bdd\s+if=/i,
      />\s*\/dev\/(sd|hd|nvme|disk)/i,
      /:\(\)\{\s*:\|:&\s*\}/, // fork bomb
    ];

    const isDangerous = dangerousPatterns.some((pattern) => pattern.test(command));

    if (isDangerous && context.requestConfirmation) {
      const session = sessionRegistry.active;
      const confirmed = await context.requestConfirmation(
        `This command looks potentially dangerous:\n  ${command}\n\nSession: ${session.info.label} (${session.info.kind})\n\nDo you want to proceed?`
      );
      if (!confirmed) {
        return {
          success: false,
          output: '',
          error: 'Command execution cancelled by user',
        };
      }
    }

    // Secrets-fishing guard: env, printenv, cat .env, anything in ~/.ssh
    if (bashLooksSecretFishing(command)) {
      if (!context.requestConfirmation) {
        return {
          success: false,
          output: '',
          error: 'Refused: this command would expose credentials (env vars, SSH keys, .env files, etc.). Ask the user to run it themselves with !cmd if they intend to.',
        };
      }
      const ok = await context.requestConfirmation(
        `This command would expose credentials to the model:\n  ${command}\n\nProceed?`
      );
      if (!ok) {
        return {
          success: false,
          output: '',
          error: 'Refused by user — credential-exposing command',
        };
      }
    }

    // Check permissions for non-safe commands
    const permissions = await loadPermissions();
    const safeCommand = isSafeCommand(command);
    const allowed = isCommandAllowed(permissions, command);
    
    if (!safeCommand && !allowed && context.requestConfirmation) {
      const confirmed = await context.requestConfirmation(
        `Run command: ${command}?`
      );
      if (!confirmed) {
        return {
          success: false,
          output: '',
          error: 'Command cancelled by user',
        };
      }
      // Remember permission
      await allowCommand(command.split(' ')[0] ?? command);
    }

    const session = sessionRegistry.active;

    // For local sessions, prefix with cd to context.cwd so the LLM's commands
    // resolve from the workspace. For ssh/custom sessions, the remote shell
    // owns its own cwd.
    let cmd = command;
    if (session.info.kind === 'local' && context.cwd) {
      cmd = `cd ${JSON.stringify(context.cwd)} 2>/dev/null; ${command}`;
    }

    // Handle abort signal
    const abortPromise = context.abortSignal
      ? new Promise<ToolResult>((_, reject) => {
          context.abortSignal!.addEventListener('abort', () => {
            reject(new Error('Command aborted by user'));
          });
        })
      : null;

    const runPromise = session.run(cmd, timeout);

    try {
      const result = abortPromise
        ? await Promise.race([runPromise, abortPromise] as const)
        : await runPromise;

      // Handle abort signal case (returns ToolResult)
      if (context.abortSignal && 'success' in result) {
        return result;
      }

      // Handle normal RunResult
      const runResult = result as { output: string; exitCode: number };
      let output = runResult.output;
      // Defense in depth — scrub anything that looks like a credential before
      // the model sees it, even if the command itself wasn't flagged.
      output = redactSecrets(output).output;
      let truncated = false;
      if (output.length > MAX_OUTPUT_LENGTH) {
        output = output.slice(0, MAX_OUTPUT_LENGTH) + '\n... (output truncated)';
        truncated = true;
      }

      if (runResult.exitCode === 0) {
        return { success: true, output, truncated };
      }

      return {
        success: false,
        output,
        error: `Exit code ${runResult.exitCode} on session "${session.info.label}"`,
        truncated,
      };
    } catch (err) {
      const error = err as Error;
      if (error.message === 'Command aborted by user') {
        return {
          success: false,
          output: '',
          error: 'Command aborted by user',
        };
      }
      return {
        success: false,
        output: '',
        error: error.message || 'Command execution failed',
      };
    }
  },
};
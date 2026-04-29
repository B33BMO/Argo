// Agent tool - allows the main LLM to spawn sub-agents
import type { Tool } from './types.js';
import { AgentRunner, getAgent, listAgents } from '../skills/agents.js';
import type { LLMProvider } from '../providers/types.js';

export function createAgentTool(provider: LLMProvider): Tool {
  return {
    name: 'agent',
    description: `Spawn a focused sub-agent to do work in parallel with you. Call this tool **multiple times in the same turn** to fan out — every agent call in a turn runs concurrently and all results return together. Reach for it when:
- you'd otherwise do >3 reads/greps to answer a question (use explorer)
- a subtask is well-scoped and independent of the rest of the work (use coder/researcher)
- you want a second pass on something you wrote (use reviewer)
- a bug needs reproduction + log spelunking (use debugger)

Each agent has no memory of this conversation, so the \`task\` field must be self-contained — include file paths, prior findings, and what "done" looks like.

Available agents:
- explorer — codebase search; "where is X defined?", "which files reference Y?". Read-only.
- coder    — implement a focused change. Reads + writes + bash. Best for self-contained edits.
- reviewer — second-opinion code review. Read-only; reports issues with file:line refs.
- researcher — web + local research via curl. Synthesizes and cites.
- debugger — reproduce + diagnose bugs. Bash + reads. Reports root cause.`,
    parameters: {
      type: 'object',
      properties: {
        agent: {
          type: 'string',
          description: 'Agent name: explorer, coder, reviewer, researcher, or debugger',
          enum: ['explorer', 'coder', 'reviewer', 'researcher', 'debugger'],
        },
        task: {
          type: 'string',
          description: 'Clear, self-contained task description. The agent has no memory of this conversation, so include all context it needs.',
        },
        context: {
          type: 'string',
          description: 'Optional additional context (file paths, prior findings, constraints)',
        },
      },
      required: ['agent', 'task'],
    },
    async execute(args, context) {
      const agentName = args.agent as string;
      const task = args.task as string;
      const taskContext = args.context as string | undefined;

      const agent = getAgent(agentName);
      if (!agent) {
        return {
          success: false,
          output: '',
          error: `Unknown agent: ${agentName}. Available: ${listAgents().map(a => a.name).join(', ')}`,
        };
      }

      const runner = new AgentRunner(provider);
      const result = await runner.run(
        agent,
        { agentName, task, context: taskContext },
        context
      );

      const summary = [
        `Agent: @${result.agentName} · ${(result.duration / 1000).toFixed(1)}s · tools: ${result.toolsUsed.join(', ') || 'none'}`,
        '',
        result.output,
      ].join('\n');

      return {
        success: result.success,
        output: summary,
        error: result.error,
      };
    },
  };
}

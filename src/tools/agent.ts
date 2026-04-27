// Agent tool - allows the main LLM to spawn sub-agents
import type { Tool } from './types.js';
import { AgentRunner, getAgent, listAgents } from '../skills/agents.js';
import type { LLMProvider } from '../providers/types.js';

export function createAgentTool(provider: LLMProvider): Tool {
  return {
    name: 'agent',
    description: `Spawn a focused sub-agent. **Call this tool multiple times in a single turn to run agents in parallel** — Roo will execute every agent call in the same turn concurrently and you'll get all results back at once. Use this for fan-out research, splitting independent subtasks, or comparing approaches. Available agents: ${listAgents().map(a => `${a.name} (${a.description})`).join('; ')}`,
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

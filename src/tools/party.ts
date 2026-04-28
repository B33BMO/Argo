// Argo Party tool — let the LLM kick off a multi-agent debate.
import type { Tool } from './types.js';
import type { LLMProvider } from '../providers/types.js';
import { runParty, formatTranscriptForChat } from '../skills/party.js';
import { listAgents } from '../skills/agents.js';

export function createPartyTool(provider: LLMProvider): Tool {
  return {
    name: 'party',
    description: `Stage a multi-agent debate. Each invited agent gets a turn each round, sees what previous speakers said, and responds to them by name. Use for genuinely contested questions where multiple perspectives matter (architecture trade-offs, code review pile-ons, design decisions). Available agents: ${listAgents().map(a => a.name).join(', ')}.`,
    parameters: {
      type: 'object',
      properties: {
        topic: {
          type: 'string',
          description: 'The debate topic — frame it as a question or position to argue about.',
        },
        agents: {
          type: 'array',
          items: { type: 'string' },
          description: 'Agent names to invite (2 or more). Speak order matters.',
        },
        rounds: {
          type: 'number',
          description: 'How many debate rounds (default 2, max 4).',
        },
        framing: {
          type: 'string',
          description: 'Optional extra framing appended to each agent\'s prompt (e.g., "argue from a security standpoint").',
        },
      },
      required: ['topic', 'agents'],
    },
    async execute(args, context) {
      const topic = args.topic as string;
      const agentNames = args.agents as string[];
      const rounds = Math.min(4, Math.max(1, (args.rounds as number) || 2));
      const framing = args.framing as string | undefined;

      if (!Array.isArray(agentNames) || agentNames.length < 2) {
        return { success: false, output: '', error: 'Party needs at least 2 agents' };
      }

      try {
        const transcript = await runParty(provider, context, {
          topic,
          agents: agentNames,
          rounds,
          framing,
        });
        return {
          success: true,
          output: formatTranscriptForChat(transcript),
        };
      } catch (err) {
        return {
          success: false,
          output: '',
          error: (err as Error).message,
        };
      }
    },
  };
}

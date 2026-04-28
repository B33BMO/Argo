// Multi-agent debate ("Argo party") — agents take turns on a shared topic,
// reading what the previous speakers have said and responding to them.
// Reuses the AgentRunner so output streams live to the AgentRunPanel.
import type { LLMProvider, Message } from '../providers/types.js';
import type { ToolContext } from '../tools/types.js';
import { AgentRunner, getAgent } from './agents.js';
import type { AgentDefinition, AgentResult } from './types.js';

export interface PartyTurn {
  agentName: string;
  round: number;
  output: string;
  duration: number;
  success: boolean;
  error?: string;
}

export interface PartyTranscript {
  topic: string;
  turns: PartyTurn[];
  totalDuration: number;
}

interface PartyOptions {
  topic: string;
  /** Agent names to invite. Order matters — they speak in this order each round. */
  agents: string[];
  /** Number of debate rounds. */
  rounds?: number;
  /** Optional persona override for the debate (appended to each agent's system prompt). */
  framing?: string;
}

const DEFAULT_FRAMING = `You are participating in a multi-agent debate. Other agents will speak before and after you on the same topic.
- Read what previous speakers said and respond to them by name (@reviewer, @explorer, etc.).
- Disagree when you actually disagree — this is a debate, not a chorus.
- Keep your turn under 6 sentences. No tools unless absolutely needed.
- Do NOT restate the topic or summarize previous turns; engage with them.`;

/**
 * Run a multi-agent debate. Each round, each agent speaks once, seeing
 * prior contributions formatted as a transcript. Returns the full transcript.
 */
export async function runParty(
  provider: LLMProvider,
  context: ToolContext,
  options: PartyOptions
): Promise<PartyTranscript> {
  const rounds = options.rounds ?? 2;
  const framing = options.framing ?? DEFAULT_FRAMING;
  const startedAt = Date.now();

  const agents: AgentDefinition[] = [];
  for (const name of options.agents) {
    const def = getAgent(name);
    if (def) {
      // Clone so we can append framing without mutating the registry copy
      agents.push({
        ...def,
        systemPrompt: def.systemPrompt + '\n\n' + framing,
        // Cap iterations hard — debate turns must not run away
        maxIterations: 3,
      });
    }
  }

  if (agents.length < 2) {
    throw new Error('Party needs at least 2 valid agent names');
  }

  const turns: PartyTurn[] = [];

  for (let r = 1; r <= rounds; r++) {
    for (const def of agents) {
      const transcript = formatTranscript(options.topic, turns);
      const task = transcript;
      const runner = new AgentRunner(provider);
      const result: AgentResult = await runner.run(
        def,
        { agentName: def.name, task },
        context
      );
      turns.push({
        agentName: def.name,
        round: r,
        output: result.output || '(no response)',
        duration: result.duration,
        success: result.success,
        error: result.error,
      });
    }
  }

  return {
    topic: options.topic,
    turns,
    totalDuration: Date.now() - startedAt,
  };
}

function formatTranscript(topic: string, turns: PartyTurn[]): string {
  const header = `# Debate topic\n${topic}\n`;
  if (turns.length === 0) {
    return `${header}\nYou are the first speaker. Open with your take in 3-6 sentences.`;
  }
  const body = turns
    .map(t => `## @${t.agentName} (round ${t.round})\n${t.output.trim()}`)
    .join('\n\n');
  return `${header}\n## Transcript so far\n\n${body}\n\n---\nNow it's your turn. Address the previous speakers by name where you agree or disagree.`;
}

/**
 * Format a transcript for display in the chat as a single assistant-style summary.
 */
export function formatTranscriptForChat(transcript: PartyTranscript): string {
  const header = `**Argo party · ${transcript.turns.length} turns · ${(transcript.totalDuration / 1000).toFixed(1)}s**\n\n_Topic:_ ${transcript.topic}\n`;
  const body = transcript.turns
    .map(t => `### @${t.agentName} (round ${t.round})\n${t.output.trim()}`)
    .join('\n\n');
  return `${header}\n${body}`;
}

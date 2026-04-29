// Scripted LLMProvider for the smoke harness. Each ScriptStep is either a
// stream chunk to yield or a delay. Multiple turns are supported: the first
// user.send() consumes the first script, the second consumes the next, etc.
import type {
  LLMProvider,
  StreamChunk,
  Message,
  ChatOptions,
} from '../providers/types.js';

export type ScriptStep =
  | { kind: 'chunk'; chunk: StreamChunk }
  | { kind: 'delay'; ms: number }
  | { kind: 'end' };

export interface MockProviderOptions {
  /** One script per turn. After all scripts run, further turns yield nothing. */
  scripts: ScriptStep[][];
  /** Default per-chunk delay if a step doesn't specify one. */
  baseDelayMs?: number;
  name?: string;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export function createMockProvider(opts: MockProviderOptions): LLMProvider {
  const { scripts, baseDelayMs = 8, name = 'mock' } = opts;
  let turn = 0;

  return {
    name,

    async *chat(_messages: Message[], _options?: ChatOptions) {
      const script = scripts[turn] ?? [];
      turn++;
      for (const step of script) {
        if (step.kind === 'delay') {
          await sleep(step.ms);
          continue;
        }
        if (step.kind === 'end') return;
        if (step.kind === 'chunk') {
          if (baseDelayMs > 0) await sleep(baseDelayMs);
          yield step.chunk;
        }
      }
    },

    async listModels() {
      return ['mock-7b'];
    },

    supportsToolCalling() {
      return true;
    },
  };
}

/** Convenience: split a string into char-by-char text chunks. */
export function textChunks(s: string): ScriptStep[] {
  return Array.from(s).map(ch => ({
    kind: 'chunk' as const,
    chunk: { type: 'text' as const, content: ch },
  }));
}

/** Convenience: split a string into char-by-char reasoning chunks. */
export function reasoningChunks(s: string): ScriptStep[] {
  return Array.from(s).map(ch => ({
    kind: 'chunk' as const,
    chunk: { type: 'reasoning' as const, content: ch },
  }));
}

export function toolCall(
  name: string,
  args: Record<string, unknown>,
  id = `tc_${Math.random().toString(36).slice(2, 8)}`,
): ScriptStep {
  return {
    kind: 'chunk',
    chunk: { type: 'tool_call', toolCall: { id, name, arguments: args } },
  };
}

export function delay(ms: number): ScriptStep {
  return { kind: 'delay', ms };
}

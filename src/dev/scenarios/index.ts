import type { ScriptStep } from '../mock-provider.js';

export interface Scenario {
  name: string;
  description: string;
  /** What the user types as their first message. */
  userInput: string;
  /** Stream scripts, one per assistant turn. */
  scripts: ScriptStep[][];
  /** Stream-level base delay between yielded chunks. */
  baseDelayMs?: number;
  /** Total time to run before exiting (ms). */
  durationMs?: number;
  /** When to snapshot frames (ms after start). */
  snapshotsAtMs?: number[];
  /** Optional further user input to feed mid-scenario, [delayMs, text]. */
  laterInputs?: Array<[number, string]>;
}

import { longThinking } from './long-thinking.js';
import { xmlLeak } from './xml-leak.js';
import { queueDrain } from './queue-drain.js';
import { toolSpam } from './tool-spam.js';

export const SCENARIOS: Record<string, Scenario> = {
  'long-thinking': longThinking,
  'xml-leak': xmlLeak,
  'queue-drain': queueDrain,
  'tool-spam': toolSpam,
};

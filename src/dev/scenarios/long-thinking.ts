import type { Scenario } from './index.js';
import { reasoningChunks, textChunks, delay } from '../mock-provider.js';

// Long reasoning followed by a short response — verify the thinking panel
// collapses, sparkline shows token rate, no flicker.
export const longThinking: Scenario = {
  name: 'long-thinking',
  description: 'Long reasoning, then a short answer.',
  userInput: 'Walk me through how a bytecode VM dispatches instructions.',
  scripts: [
    [
      ...reasoningChunks(
        'Let me think about this. A bytecode VM has an instruction pointer. ' +
          'On each tick it fetches the next opcode, decodes the operand, and ' +
          'jumps into a handler. The hot loop usually uses a computed-goto or ' +
          'a switch. Some VMs use direct threading, others use indirect.\n\n' +
          'Key tradeoffs: branch prediction, cache locality, register pressure.'
      ),
      delay(50),
      ...textChunks(
        'A bytecode VM cycles fetch-decode-execute on an instruction pointer. ' +
          'Hot loops typically use a switch or computed goto over opcode handlers.'
      ),
    ],
  ],
  baseDelayMs: 6,
  durationMs: 4000,
  snapshotsAtMs: [200, 800, 1600, 2800, 3800],
};

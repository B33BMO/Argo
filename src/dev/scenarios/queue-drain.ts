import type { Scenario } from './index.js';
import { textChunks, delay } from '../mock-provider.js';

// User types follow-up messages while the first turn is in flight; verify
// the "queued" indicator shows and they drain in order.
export const queueDrain: Scenario = {
  name: 'queue-drain',
  description: 'Type while in-flight; queued indicator + drain.',
  userInput: 'count to three slowly',
  scripts: [
    [...textChunks('one... '), delay(400), ...textChunks('two... '), delay(400), ...textChunks('three.')],
    [...textChunks('reply 1: ack')],
    [...textChunks('reply 2: ack')],
  ],
  baseDelayMs: 8,
  durationMs: 6000,
  snapshotsAtMs: [200, 600, 1200, 2400, 4000, 5800],
  laterInputs: [
    [400, 'follow-up A'],
    [800, 'follow-up B'],
  ],
};

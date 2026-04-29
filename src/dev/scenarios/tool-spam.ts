import type { Scenario } from './index.js';
import { textChunks, toolCall, delay } from '../mock-provider.js';

// Many tool calls in a single turn — verify cards stay visible after the
// turn ends and don't flicker into nothing.
export const toolSpam: Scenario = {
  name: 'tool-spam',
  description: 'Eight parallel tool calls in one turn.',
  userInput: 'audit every config file',
  scripts: [
    [
      ...textChunks('Reading config files in parallel.\n'),
      delay(20),
      toolCall('read_file', { path: 'package.json' }, 'tc1'),
      delay(15),
      toolCall('read_file', { path: 'tsconfig.json' }, 'tc2'),
      delay(15),
      toolCall('read_file', { path: 'tsup.config.ts' }, 'tc3'),
      delay(15),
      toolCall('read_file', { path: '.gitignore' }, 'tc4'),
      delay(15),
      toolCall('list_dir', { path: 'src' }, 'tc5'),
      delay(15),
      toolCall('glob', { pattern: 'src/**/*.tsx' }, 'tc6'),
      delay(15),
      toolCall('glob', { pattern: 'src/**/*.ts' }, 'tc7'),
      delay(15),
      toolCall('grep', { pattern: 'TODO', path: 'src' }, 'tc8'),
    ],
    [...textChunks('Done — 8 files inspected, nothing alarming.')],
  ],
  baseDelayMs: 6,
  durationMs: 5000,
  snapshotsAtMs: [400, 1200, 2400, 3600, 4800],
};

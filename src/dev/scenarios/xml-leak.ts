import type { Scenario } from './index.js';
import { reasoningChunks, textChunks, toolCall, delay } from '../mock-provider.js';

// Reproduces the bug from the user's transcript: model emits <tool_call>
// XML into the reasoning channel after already issuing real tool calls.
export const xmlLeak: Scenario = {
  name: 'xml-leak',
  description: 'Model leaks raw <tool_call> XML into the reasoning channel.',
  userInput: 'Document this directory.',
  scripts: [
    [
      ...textChunks("I'll explore the directory first.\n"),
      delay(40),
      toolCall('list_dir', { path: '.', show_hidden: true }),
      delay(40),
      toolCall('glob', { pattern: '**/*' }),
    ],
    // Second turn: response after tool results — but with XML leakage
    [
      ...textChunks('Now let me read key files:\n'),
      delay(30),
      toolCall('read_file', { path: 'package.json' }),
      delay(30),
      toolCall('read_file', { path: 'README.md' }),
      delay(60),
      ...textChunks('Lets try that again\n'),
      delay(40),
      ...reasoningChunks(
        '\n</function>\n</tool_call>\n<tool_call>\n  <name>read_file</name>\n  <arguments>{"path":"src/index.ts"}</arguments>\n</tool_call>\n'
      ),
    ],
  ],
  baseDelayMs: 5,
  durationMs: 6000,
  snapshotsAtMs: [400, 1200, 2200, 3500, 5000, 5800],
};

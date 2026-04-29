// Render WelcomeScreen in isolation and dump the frame so we can verify
// the mascot lines up.
//
//   npm run smoke -- welcome
//
// (Wired through smoke.tsx so it picks up the bundled tsx config.)
import React from 'react';
import { render } from 'ink-testing-library';
import { WelcomeScreen } from '../components/WelcomeScreen.js';

function stripAnsi(s: string): string {
  return s
    .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\x1B\][^\x07]*\x07/g, '')
    .replace(/\x1B[()][A-Z0-9]/g, '');
}

export async function runWelcomePreview(opts: { raw: boolean }): Promise<number> {
  const { lastFrame, unmount } = render(
    <WelcomeScreen modelName="qwen3-coder" providerName="llama.cpp" />
  );
  // Give Ink a tick to flush.
  await new Promise(r => setTimeout(r, 50));
  const frame = lastFrame() ?? '';
  const out = opts.raw ? frame : stripAnsi(frame);
  process.stdout.write('\n──── welcome screen ────\n');
  process.stdout.write(out);
  process.stdout.write('\n──── end ────\n');

  // Width audit: every line of the mascot should be 7 cells.
  const lines = stripAnsi(frame).split('\n');
  const mascotIdx = lines.findIndex(l => l.includes('▟▀▀▀▙'));
  if (mascotIdx >= 0) {
    process.stdout.write('\nmascot widths:\n');
    for (let i = mascotIdx; i < Math.min(mascotIdx + 4, lines.length); i++) {
      // Count Unicode code points, not UTF-16 code units.
      const trimmed = lines[i].replace(/\s+$/, '');
      const cells = [...trimmed].length;
      process.stdout.write(`  line ${i - mascotIdx}: ${cells} cells  "${trimmed}"\n`);
    }
  } else {
    process.stdout.write('\nmascot block not found in frame.\n');
  }

  unmount();
  return 0;
}

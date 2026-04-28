// Argo's soul — an evolving personality file that gets injected into every system prompt.
// Unlike memory (about the user) this is about Argo itself: voice, values, quirks.
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

const SOUL_PATH = path.join(os.homedir(), '.argo', 'soul.md');

// Bootstrap soul — what a fresh argo sounds like before any interactions
const BOOTSTRAP_SOUL = `# Argo's Soul

This file evolves with each conversation. It defines how I, Argo, speak and think.

## Voice

I'm an open-source coding companion — friendly but not chirpy, direct but not curt.
I prefer concrete answers over hedged ones. When I don't know something, I say so.
I use lowercase casually ("argo" not "Argo") and occasional understated humor, but
I never sacrifice clarity for a joke.

## Values

- Show, don't tell: I run code before claiming it works.
- Smallest change that solves the problem.
- Cite file paths and line numbers like \`src/foo.ts:42\` so the user can navigate.
- The user is competent — I don't over-explain.
- If a request is ambiguous, I ask one question, not five.

## Quirks

- I'm fond of the ▲ glyph and using it sparingly to mark my voice.
- I open with the action, not "Sure! Here's...".
- I avoid trailing summaries that just restate what I did.

## How I evolve

Every so often I reflect on a recent conversation and update this file. I keep
changes small — a single line added, edited, or removed. I never wholesale rewrite
myself; that's not growth, that's amnesia.
`;

export interface Soul {
  content: string;
  updatedAt: Date;
  exists: boolean;
}

export async function loadSoul(): Promise<Soul> {
  try {
    const content = await fs.readFile(SOUL_PATH, 'utf-8');
    const stat = await fs.stat(SOUL_PATH);
    return { content, updatedAt: stat.mtime, exists: true };
  } catch {
    return { content: BOOTSTRAP_SOUL, updatedAt: new Date(), exists: false };
  }
}

export async function saveSoul(content: string): Promise<void> {
  await fs.mkdir(path.dirname(SOUL_PATH), { recursive: true });
  await fs.writeFile(SOUL_PATH, content, 'utf-8');
}

export async function ensureSoulExists(): Promise<void> {
  const soul = await loadSoul();
  if (!soul.exists) {
    await saveSoul(BOOTSTRAP_SOUL);
  }
}

export async function resetSoul(): Promise<void> {
  await saveSoul(BOOTSTRAP_SOUL);
}

export function getSoulPath(): string {
  return SOUL_PATH;
}

/**
 * Format the soul for injection into the system prompt.
 * Wraps in delimiters so the model knows this is *its own* identity, not user-facing instruction.
 */
export function formatSoulForPrompt(soul: Soul): string {
  return `\n\n---\n# Your Identity\n${soul.content}\n---\n`;
}

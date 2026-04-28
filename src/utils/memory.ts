// Per-project memory at <workspace>/.argo/memory.md
// Auto-injected into the system prompt so Argo remembers project-specific facts
// across sessions. Lightweight — just a markdown file the user (and Argo) can edit.
import * as fs from 'fs/promises';
import * as path from 'path';
import { getWorkspace } from './workspace.js';

const MEMORY_FILE = '.argo/memory.md';
const MAX_MEMORY_BYTES = 50_000;

const DEFAULT_MEMORY = `# Project Memory

Argo loads this file into context for every conversation in this project.
Add facts, conventions, gotchas, or links you want Argo to remember.

## Stack & Conventions
- (add notes here)

## Active Work
- (track ongoing initiatives)

## Gotchas
- (things that have bitten you before)
`;

export function getMemoryPath(): string {
  return path.join(getWorkspace().cwd, MEMORY_FILE);
}

export async function loadMemory(): Promise<string> {
  try {
    const content = await fs.readFile(getMemoryPath(), 'utf-8');
    if (content.length > MAX_MEMORY_BYTES) {
      return content.slice(0, MAX_MEMORY_BYTES) + '\n\n[truncated]';
    }
    return content;
  } catch {
    return '';
  }
}

export async function ensureMemoryExists(): Promise<void> {
  const p = getMemoryPath();
  try {
    await fs.access(p);
  } catch {
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, DEFAULT_MEMORY, 'utf-8');
  }
}

export function formatMemoryForPrompt(content: string): string {
  if (!content.trim()) return '';
  return `\n\n# Project Memory\nFacts the user has saved about this specific project. Treat as authoritative.\n\n${content}\n`;
}

export async function appendMemory(line: string): Promise<void> {
  await ensureMemoryExists();
  const p = getMemoryPath();
  const existing = await fs.readFile(p, 'utf-8');
  const trimmed = existing.endsWith('\n') ? existing : existing + '\n';
  await fs.writeFile(p, trimmed + line + '\n', 'utf-8');
}

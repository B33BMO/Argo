// Lightweight scanner that flags suspect patterns in code blocks.
// The goal is "✱ heads-up" markers — not a linter. False positives must be
// rare enough that the marker is worth a glance.

export interface Suggestion {
  /** Pattern id, used as a key. */
  id: string;
  /** Short label (max ~30 chars). */
  label: string;
  /** Suggested follow-up prompt to send back to Argo if the user accepts. */
  fixPrompt: string;
  /** First matched line — included in fix prompts for context. */
  snippet: string;
}

interface Pattern {
  id: string;
  test: RegExp;
  label: string;
  fixPromptTemplate: (snippet: string) => string;
}

const PATTERNS: Pattern[] = [
  {
    id: 'todo',
    test: /\b(TODO|FIXME|XXX|HACK)\b/,
    label: 'unresolved TODO/FIXME',
    fixPromptTemplate: s => `Resolve the TODO/FIXME on this line: \`${s.trim().slice(0, 120)}\`. Either implement it or remove it.`,
  },
  {
    id: 'debug-print',
    test: /\b(console\.(log|debug)|print\s*\(|System\.out\.println|fmt\.Println|dbg!|pp\s+)/,
    label: 'leftover debug print',
    fixPromptTemplate: s => `Remove the debug print: \`${s.trim().slice(0, 120)}\` — it looks like leftover diagnostic output.`,
  },
  {
    id: 'localhost',
    test: /\b(?:https?:\/\/(?:localhost|127\.0\.0\.1)|localhost:\d+|127\.0\.0\.1:\d+)\b/,
    label: 'hardcoded localhost',
    fixPromptTemplate: s => `Replace the hardcoded localhost in \`${s.trim().slice(0, 120)}\` with a config value or environment variable.`,
  },
  {
    id: 'any-type',
    test: /:\s*any\b|<any>|as\s+any\b/,
    label: 'TypeScript `any` escape hatch',
    fixPromptTemplate: s => `Replace the \`any\` in \`${s.trim().slice(0, 120)}\` with a precise type.`,
  },
  {
    id: 'empty-catch',
    test: /catch\s*\([^)]*\)\s*\{\s*\}|except[^:]*:\s*pass/,
    label: 'silently swallowed error',
    fixPromptTemplate: s => `The empty catch block in \`${s.trim().slice(0, 120)}\` swallows errors. Log, rethrow, or comment why it's safe.`,
  },
  {
    id: 'await-loop',
    test: /for\s*\([^)]*\)\s*\{[^}]*await /,
    label: 'await inside for loop',
    fixPromptTemplate: s => `The for-loop in \`${s.trim().slice(0, 120)}\` awaits sequentially — consider Promise.all if the iterations are independent.`,
  },
  {
    id: 'secret',
    test: /\b(api[_-]?key|secret|password|token)\s*[:=]\s*["'][^"']{8,}["']/i,
    label: 'hardcoded credential',
    fixPromptTemplate: s => `\`${s.trim().slice(0, 120)}\` looks like a hardcoded credential. Move it to an env var or secrets manager.`,
  },
];

/**
 * Extract code blocks from a markdown message and scan each line.
 * Returns at most one suggestion per pattern (the first hit) to keep the
 * panel quiet.
 */
export function scanForSuggestions(markdown: string): Suggestion[] {
  const blocks = extractCodeBlocks(markdown);
  if (blocks.length === 0) return [];

  const seen = new Set<string>();
  const out: Suggestion[] = [];

  for (const block of blocks) {
    const lines = block.split('\n');
    for (const line of lines) {
      for (const p of PATTERNS) {
        if (seen.has(p.id)) continue;
        if (p.test.test(line)) {
          seen.add(p.id);
          out.push({
            id: p.id,
            label: p.label,
            snippet: line,
            fixPrompt: p.fixPromptTemplate(line),
          });
        }
      }
    }
  }

  return out;
}

function extractCodeBlocks(markdown: string): string[] {
  const blocks: string[] = [];
  const re = /```[\w-]*\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown)) !== null) {
    blocks.push(m[1]);
  }
  return blocks;
}

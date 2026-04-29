import React, { memo } from 'react';
import { Box, Text } from 'ink';
import { computeDiff } from '../utils/diff.js';

interface ToolCallCardProps {
  name: string;
  arguments: Record<string, unknown>;
  status: 'pending' | 'running' | 'success' | 'error';
  result?: string;
  error?: string;
  duration?: number;
  /** Structured side-data the tool produced — e.g. write_file's prior contents. */
  metadata?: Record<string, unknown>;
}

/**
 * Boxed-card tool call. The card itself is the visual unit:
 *
 *   ╭───────────────────────────────────────────────────────────────╮
 *   │ read_file  package.json, src/routes/index.ts                  │
 *   ╰───────────────────────────────────────────────────────────────╯
 *
 * For edit_file and write_file, a small diff block renders below the args
 * line so you can see at a glance what changed. Status only intrudes when
 * there's something to show: yellow border while running, red border + error
 * block on failure. Quiet success doesn't get a checkmark or duration.
 */

const PRIMARY_ARG: Record<string, { key: string; defaultValue?: string }> = {
  bash: { key: 'command' },
  read_file: { key: 'path' },
  write_file: { key: 'path' },
  edit_file: { key: 'path' },
  list_dir: { key: 'path', defaultValue: '.' },
  glob: { key: 'pattern' },
  grep: { key: 'pattern' },
  curl: { key: 'url' },
};

function summarizeArgs(toolName: string, args: Record<string, unknown>): string {
  const fmt = (v: unknown): string => {
    const str = typeof v === 'string' ? v : JSON.stringify(v);
    return str.length > 90 ? str.slice(0, 87) + '...' : str;
  };

  const primary = PRIMARY_ARG[toolName];
  if (primary) {
    const raw = args[primary.key];
    if (raw !== undefined && raw !== null && raw !== '') return fmt(raw);
    if (primary.defaultValue !== undefined) return primary.defaultValue;
  }
  const first = Object.values(args).find(v => v !== undefined && v !== null && v !== '');
  return first !== undefined ? fmt(first) : '';
}

export const ToolCallCard = memo(
  function ToolCallCard({ name, arguments: args, status, error, metadata }: ToolCallCardProps) {
    const summary = summarizeArgs(name, args);

    // Border: gray for settled calls (calm), warm for in-flight, red on error.
    const borderColor =
      status === 'running' ? 'yellow' :
      status === 'error' ? 'red' :
      'gray';

    // Diff data — only meaningful for edit_file/write_file at success.
    const diff = status === 'success' ? buildDiff(name, args, metadata) : null;

    return (
      <Box flexDirection="column" marginY={0} marginLeft={2}>
        <Box
          borderStyle="round"
          borderColor={borderColor as any}
          paddingX={1}
          flexDirection="column"
        >
          <Box>
            <Text color="green" bold>{name}</Text>
            {summary && (
              <Text color="white">  {summary}</Text>
            )}
            {diff && (
              <Text color="gray" dimColor>  +{diff.added} -{diff.removed}</Text>
            )}
          </Box>
          {diff && diff.lines.length > 0 && (
            <DiffBody lines={diff.lines} hidden={diff.hidden} />
          )}
        </Box>
        {status === 'error' && error && (
          <Box marginLeft={2}>
            <Text color="red" wrap="wrap">
              {error.length > 200 ? error.slice(0, 200) + '...' : error}
            </Text>
          </Box>
        )}
      </Box>
    );
  },
  (prev, next) =>
    prev.status === next.status &&
    prev.error === next.error &&
    prev.name === next.name &&
    prev.metadata === next.metadata
);

interface BuiltDiff {
  added: number;
  removed: number;
  lines: Array<{ op: 'add' | 'del' | 'eq'; text: string }>;
  hidden: number;
}

const MAX_DIFF_LINES = 10;

function buildDiff(
  name: string,
  args: Record<string, unknown>,
  metadata: Record<string, unknown> | undefined,
): BuiltDiff | null {
  let oldText = '';
  let newText = '';
  let isNewFile = false;

  if (name === 'edit_file') {
    oldText = (args.old_string as string) ?? '';
    newText = (args.new_string as string) ?? '';
  } else if (name === 'write_file') {
    if (!metadata) return null;
    oldText = (metadata.priorContent as string) ?? '';
    newText = (metadata.newContent as string) ?? (args.content as string) ?? '';
    isNewFile = !!metadata.isNewFile;
  } else {
    return null;
  }

  // New file: render up to MAX_DIFF_LINES of new content as `+` lines.
  if (isNewFile) {
    const all = newText.split('\n');
    // A trailing newline in the file produces a phantom empty entry — drop it
    // so we don't render a stray `+ ` line under the actual content.
    if (all.length > 0 && all[all.length - 1] === '') all.pop();
    const head = all.slice(0, MAX_DIFF_LINES);
    return {
      added: all.length,
      removed: 0,
      lines: head.map(text => ({ op: 'add' as const, text })),
      hidden: Math.max(0, all.length - head.length),
    };
  }

  // Compute structured diff and flatten its hunks into a flat line list,
  // capped at MAX_DIFF_LINES.
  const diff = computeDiff(oldText, newText, 1);
  const flat: Array<{ op: 'add' | 'del' | 'eq'; text: string }> = [];
  for (const hunk of diff.hunks) {
    for (const ln of hunk.lines) {
      const op =
        ln.type === 'add' ? 'add' :
        ln.type === 'remove' ? 'del' :
        'eq';
      flat.push({ op, text: ln.content });
    }
  }
  const display = flat.slice(0, MAX_DIFF_LINES);
  return {
    added: diff.additions,
    removed: diff.deletions,
    lines: display,
    hidden: Math.max(0, flat.length - display.length),
  };
}

function DiffBody({
  lines,
  hidden,
}: {
  lines: Array<{ op: 'add' | 'del' | 'eq'; text: string }>;
  hidden: number;
}) {
  return (
    <Box flexDirection="column" marginTop={0}>
      {lines.map((ln, i) => {
        const glyph = ln.op === 'add' ? '+' : ln.op === 'del' ? '-' : ' ';
        const color = ln.op === 'add' ? 'green' : ln.op === 'del' ? 'red' : 'gray';
        return (
          <Box key={i}>
            <Text color={color} bold>{glyph} </Text>
            <Text color={color} dimColor={ln.op === 'eq'}>{truncateLine(ln.text)}</Text>
          </Box>
        );
      })}
      {hidden > 0 && (
        <Text color="gray" dimColor>  … +{hidden} more line{hidden === 1 ? '' : 's'}</Text>
      )}
    </Box>
  );
}

function truncateLine(s: string): string {
  const cap = 100;
  if (s.length <= cap) return s;
  return s.slice(0, cap - 1) + '…';
}

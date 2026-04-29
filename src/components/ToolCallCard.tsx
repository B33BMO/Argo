import React, { memo } from 'react';
import { Box, Text } from 'ink';

interface ToolCallCardProps {
  name: string;
  arguments: Record<string, unknown>;
  status: 'pending' | 'running' | 'success' | 'error';
  result?: string;
  error?: string;
  duration?: number;
}

/**
 * Boxed-card tool call. The card itself is the visual unit:
 *
 *   ╭───────────────────────────────────────────────────────────────╮
 *   │ read_file  package.json, src/routes/index.ts                  │
 *   ╰───────────────────────────────────────────────────────────────╯
 *
 * Status only intrudes when there's something to show: a yellow border while
 * running, a red border + error block on failure. Quiet success doesn't get
 * a checkmark or a duration — the card's presence is enough signal.
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
  function ToolCallCard({ name, arguments: args, status, error }: ToolCallCardProps) {
    const summary = summarizeArgs(name, args);

    // Border: gray for settled calls (calm), warm for in-flight, red on error.
    const borderColor =
      status === 'running' ? 'yellow' :
      status === 'error' ? 'red' :
      'gray';

    return (
      <Box flexDirection="column" marginY={0} marginLeft={2}>
        <Box
          borderStyle="round"
          borderColor={borderColor as any}
          paddingX={1}
        >
          <Text color="green" bold>{name}</Text>
          {summary && (
            <Text color="white">  {summary}</Text>
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
    prev.name === next.name
);

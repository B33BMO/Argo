import React, { memo } from 'react';
import { Box, Text } from 'ink';
import { Spinner } from './Spinner.js';

interface ToolCallCardProps {
  name: string;
  arguments: Record<string, unknown>;
  status: 'pending' | 'running' | 'success' | 'error';
  result?: string;
  error?: string;
  duration?: number;
}

const STATUS_DOT = {
  pending: { color: 'gray', char: '○' },
  running: { color: 'yellow', char: '●' },
  success: { color: 'green', char: '●' },
  error: { color: 'red', char: '●' },
} as const;

function summarizeArgs(args: Record<string, unknown>): string {
  const entries = Object.entries(args);
  if (entries.length === 0) return '';
  return entries
    .slice(0, 2)
    .map(([k, v]) => {
      const str = typeof v === 'string' ? v : JSON.stringify(v);
      const display = str.length > 40 ? str.slice(0, 37) + '...' : str;
      return `${k}=${display}`;
    })
    .join(' ');
}

export const ToolCallCard = memo(
  function ToolCallCard({ name, arguments: args, status, error, duration }: ToolCallCardProps) {
    const dot = STATUS_DOT[status];
    const argSummary = summarizeArgs(args);

    return (
      <Box flexDirection="column" marginY={0} paddingLeft={2}>
        <Box>
          {status === 'running' ? (
            <Spinner color="yellow" />
          ) : (
            <Text color={dot.color as any}>{dot.char}</Text>
          )}
          <Text color="cyan" bold>
            {' '}{name}
          </Text>
          {argSummary && (
            <Text color="gray">
              {' '}{argSummary}
            </Text>
          )}
          {duration !== undefined && (
            <Text color="gray">
              {' '}· {(duration / 1000).toFixed(2)}s
            </Text>
          )}
        </Box>
        {status === 'error' && error && (
          <Box marginLeft={2}>
            <Text color="red">
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
    prev.duration === next.duration
);

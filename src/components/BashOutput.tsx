import React, { memo } from 'react';
import { Box, Text } from 'ink';

export interface BashRun {
  id: string;
  command: string;
  sessionLabel: string;
  output: string;
  exitCode: number;
  durationMs: number;
}

interface BashOutputProps {
  run: BashRun;
}

export const BashOutput = memo(function BashOutput({ run }: BashOutputProps) {
  const success = run.exitCode === 0;
  const dotColor = success ? 'green' : 'red';

  // Truncate very long output for inline display
  const lines = run.output.split('\n');
  const truncated = lines.length > 30;
  const displayLines = truncated ? [...lines.slice(0, 30), `... (${lines.length - 30} more lines)`] : lines;

  return (
    <Box flexDirection="column" marginY={0} paddingLeft={2}>
      <Box>
        <Text color={dotColor} bold>$ </Text>
        <Text color="white">{run.command}</Text>
        <Text color="gray">  ({run.sessionLabel} · {(run.durationMs / 1000).toFixed(2)}s</Text>
        {!success && <Text color="red"> · exit {run.exitCode}</Text>}
        <Text color="gray">)</Text>
      </Box>
      {run.output && (
        <Box marginLeft={2} flexDirection="column">
          {displayLines.map((line, i) => (
            <Text key={i} color="gray" wrap="wrap">
              {line || ' '}
            </Text>
          ))}
        </Box>
      )}
    </Box>
  );
});

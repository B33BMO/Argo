import React from 'react';
import { Box, Text } from 'ink';

interface ThinkingProps {
  content: string;
  isStreaming?: boolean;
}

export function Thinking({ content, isStreaming = false }: ThinkingProps) {
  if (!content) return null;

  // Truncate to last N lines while streaming to keep it readable
  const lines = content.split('\n');
  const maxLines = 8;
  const displayLines = isStreaming && lines.length > maxLines
    ? lines.slice(-maxLines)
    : lines;
  const truncated = isStreaming && lines.length > maxLines;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="gray"
      paddingX={1}
      marginBottom={1}
    >
      <Box marginBottom={1}>
        <Text color="gray" bold>
          {isStreaming ? '🧠 Thinking...' : '🧠 Thought Process'}
        </Text>
      </Box>
      <Box flexDirection="column">
        {truncated && (
          <Text color="gray" dimColor>
            ... ({lines.length - maxLines} lines above)
          </Text>
        )}
        {displayLines.map((line, i) => (
          <Text key={i} color="gray" dimColor wrap="truncate-end">
            {line}
          </Text>
        ))}
      </Box>
    </Box>
  );
}

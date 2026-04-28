import React, { memo } from 'react';
import { Box, Text } from 'ink';
import { Spinner, ThinkingDots } from './Spinner.js';

interface ThinkingPanelProps {
  content: string;
  isStreaming?: boolean;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const ThinkingPanel = memo(function ThinkingPanel({
  content,
  isStreaming = false,
  isCollapsed = false,
}: ThinkingPanelProps) {
  if (!content) return null;
  const lines = content.split('\n');
  const total = lines.length;
  const tail = isCollapsed ? [] : lines.slice(-6);

  return (
    <Box flexDirection="column" marginY={0} paddingLeft={2}>
      <Box>
        {isStreaming ? <Spinner color="yellow" /> : <Text color="yellow">●</Text>}
        <Text color="yellow" bold>
          {' '}thinking
        </Text>
        {isCollapsed && (
          <Text color="gray">
            {' '}({total} lines · Tab)
          </Text>
        )}
      </Box>
      {!isCollapsed && (
        <Box marginLeft={2} flexDirection="column">
          {tail.map((line, i) => (
            <Text key={i} color="gray" wrap="truncate-end">
              {line}
            </Text>
          ))}
        </Box>
      )}
    </Box>
  );
});

export const ThinkingIndicator = memo(function ThinkingIndicator() {
  return (
    <Box paddingLeft={2}>
      <Spinner color="yellow" />
      <Text color="yellow" bold> working</Text>
      <ThinkingDots color="yellow" />
    </Box>
  );
});

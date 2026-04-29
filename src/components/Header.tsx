import React, { memo } from 'react';
import { Box, Text } from 'ink';

export const Header = memo(function Header() {
  return (
    <Box justifyContent="space-between">
      <Box>
        <Text color="green" bold>▲</Text>
        <Text color="cyan" bold> argo</Text>
      </Box>
      <Box>
        <Text color="gray" dimColor>^P cmd · ^O sessions · ^S skills · ^R providers · /help</Text>
      </Box>
    </Box>
  );
});

interface DividerProps {
  width?: number;
  color?: string;
}

export const Divider = memo(function Divider({
  width = 50,
  color = 'gray',
}: DividerProps) {
  return (
    <Text color={color as any}>
      {'─'.repeat(width)}
    </Text>
  );
});

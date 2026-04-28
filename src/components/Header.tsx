import React, { memo } from 'react';
import { Box, Text } from 'ink';

export const Header = memo(function Header() {
  return (
    <Box marginBottom={1} justifyContent="space-between">
      <Box>
        <Text color="green" bold>▲</Text>
        <Text color="cyan" bold> argo</Text>
        <Text color="gray"> · </Text>
        <Text color="cyan">:D</Text>
      </Box>
      <Box>
        <Text color="gray">^P </Text>
        <Text color="white">cmd</Text>
        <Text color="gray">  ^O </Text>
        <Text color="white">sessions</Text>
        <Text color="gray">  ^S </Text>
        <Text color="white">skills</Text>
        <Text color="gray">  ^R </Text>
        <Text color="white">providers</Text>
        <Text color="gray">  ^L </Text>
        <Text color="white">clear</Text>
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

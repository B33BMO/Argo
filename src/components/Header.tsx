import React, { memo } from 'react';
import { Box, Text } from 'ink';

interface HeaderProps {
  subtitle?: string;
}

export const Header = memo(function Header({ subtitle }: HeaderProps) {
  return (
    <Box marginBottom={1} justifyContent="space-between">
      <Box>
        <Text color="green" bold>
          roo
        </Text>
        <Text color="gray"> · </Text>
        <Text color="cyan" dimColor>
          your open-source companion
        </Text>
      </Box>
      <Box>
        <Text color="gray" dimColor>
          ^P cmd · ^O sessions · ^S skills · ^R providers · ^L clear
        </Text>
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
    <Text color={color as any} dimColor>
      {'─'.repeat(width)}
    </Text>
  );
});

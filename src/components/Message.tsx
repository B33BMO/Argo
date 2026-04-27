import React from 'react';
import { Box, Text } from 'ink';
import type { Message as MessageType } from '../providers/types.js';

interface MessageProps {
  message: MessageType;
}

export function Message({ message }: MessageProps) {
  const { role, content, toolCalls } = message;

  const getRoleDisplay = () => {
    switch (role) {
      case 'user':
        return { label: 'You', color: 'cyan' as const };
      case 'assistant':
        return { label: 'roo', color: 'green' as const };
      case 'system':
        return { label: 'System', color: 'yellow' as const };
      case 'tool':
        return { label: 'Tool', color: 'magenta' as const };
      default:
        return { label: role, color: 'white' as const };
    }
  };

  const { label, color } = getRoleDisplay();

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text bold color={color}>
          {label}:
        </Text>
      </Box>
      <Box marginLeft={2}>
        <Text wrap="wrap">{content}</Text>
      </Box>
      {toolCalls && toolCalls.length > 0 && (
        <Box marginLeft={2} marginTop={1} flexDirection="column">
          {toolCalls.map((tc, i) => (
            <Box key={tc.id || i}>
              <Text color="magenta">
                → {tc.name}({JSON.stringify(tc.arguments).slice(0, 50)}
                {JSON.stringify(tc.arguments).length > 50 ? '...' : ''})
              </Text>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

import React, { memo } from 'react';
import { Box, Text } from 'ink';
import { Markdown } from './Markdown.js';
import type { Message } from '../providers/types.js';

interface MessageBubbleProps {
  message: Message;
  hideHeader?: boolean;
}

const ROLE_CONFIG = {
  user: { label: 'you', color: 'cyan' as const, dot: 'cyan' as const, glyph: '●' },
  assistant: { label: 'argo', color: 'white' as const, dot: 'green' as const, glyph: '▲' },
  system: { label: 'system', color: 'yellow' as const, dot: 'yellow' as const, glyph: '●' },
  tool: { label: 'tool', color: 'magenta' as const, dot: 'magenta' as const, glyph: '●' },
};

export const MessageBubble = memo(
  function MessageBubble({ message, hideHeader = false }: MessageBubbleProps) {
    const config = ROLE_CONFIG[message.role] || ROLE_CONFIG.system;

    // Don't render an empty bubble — header alone with no body is just visual noise.
    if (!message.content?.trim()) return null;

    return (
      <Box flexDirection="column" marginY={0}>
        {!hideHeader && (
          <Box>
            <Text color={config.dot} bold>{config.glyph} </Text>
            <Text color={config.color} bold>
              {config.label}
            </Text>
          </Box>
        )}
        <Box marginLeft={2} flexDirection="column">
          {message.role === 'assistant' ? (
            <Markdown>{message.content}</Markdown>
          ) : (
            <Text color={config.color} wrap="wrap">
              {message.content}
            </Text>
          )}
        </Box>
      </Box>
    );
  },
  (prev, next) =>
    prev.message.role === next.message.role &&
    prev.message.content === next.message.content &&
    prev.message.toolCalls?.length === next.message.toolCalls?.length &&
    prev.hideHeader === next.hideHeader
);

interface StreamingMessageProps {
  content: string;
  showCursor?: boolean;
}

export const StreamingMessage = memo(function StreamingMessage({
  content,
  showCursor = true,
}: StreamingMessageProps) {
  return (
    <Box flexDirection="column" marginY={0}>
      <Box>
        <Text color="green" bold>▲ </Text>
        <Text color="white" bold>argo</Text>
      </Box>
      <Box marginLeft={2} flexDirection="column">
        <Markdown>{content}</Markdown>
        {showCursor && <Text color="green">▎</Text>}
      </Box>
    </Box>
  );
});

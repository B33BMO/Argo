import React, { memo } from 'react';
import { Box, Text } from 'ink';
import { getWorkspace } from '../utils/workspace.js';

interface WelcomeScreenProps {
  modelName?: string;
  providerName?: string;
}

const TIPS: string[] = [
  'Ask me to read, write, or run anything in your project',
  '! prefix runs bash directly: !ls, !ssh user@host (opens remote session)',
  'I have bash, file ops, grep, curl, and sub-agents',
  'Fan out work to explorer / coder / reviewer / debugger sub-agents',
];

export const WelcomeScreen = memo(function WelcomeScreen({ modelName, providerName }: WelcomeScreenProps) {
  return (
    <Box flexDirection="column" paddingY={1} alignItems="center">
      {/* Argo — a tiny argonaut. The argonaut is a paper-nautilus that
          floats with its shell up; we caricature it with two eyes and a
          couple of tentacle dots. */}
      <Box flexDirection="column" alignItems="center">
        <Text color="green" bold> ▟▀▀▀▙ </Text>
        <Text color="green" bold>█▌◉ ◉▐█</Text>
        <Text color="cyan"  bold>▝▙▄▄▄▟▘</Text>
        <Text color="cyan"  bold>  ▘ ▘  </Text>
      </Box>

      {/* Wordmark — plain bold text, no block art */}
      <Box marginTop={1}>
        <Text color="green" bold>a</Text>
        <Text color="green" bold>r</Text>
        <Text color="cyan" bold>g</Text>
        <Text color="cyan" bold>o</Text>
      </Box>

      {/* Tagline */}
      <Box marginTop={0}>
        <Text color="gray">an open-source coding companion</Text>
      </Box>

      {/* Active provider/model */}
      {(providerName || modelName) && (
        <Box marginTop={1}>
          <Text color="gray">connected to </Text>
          <Text color="magenta" bold>{providerName}</Text>
          {modelName && (
            <>
              <Text color="gray"> · </Text>
              <Text color="white">{modelName}</Text>
            </>
          )}
        </Box>
      )}

      {/* Workspace */}
      <Box marginTop={0}>
        <Text color="gray">working in </Text>
        <Text color="blue" bold>⌂ </Text>
        <Text color="white" bold>{getWorkspace().display}</Text>
      </Box>

      {/* Tips card */}
      <Box flexDirection="column" paddingX={2} paddingY={0} marginTop={1} borderStyle="round" borderColor="cyan">
        {TIPS.map((tip, i) => (
          <Box key={i}>
            <Text color="yellow" bold>›</Text>
            <Text color="white"> {tip}</Text>
          </Box>
        ))}
      </Box>

      {/* Shortcut hints */}
      <Box marginTop={1}>
        <Text color="gray">type </Text>
        <Text color="cyan" bold>/help</Text>
        <Text color="gray"> or press </Text>
        <Text color="cyan" bold>^P</Text>
        <Text color="gray"> for commands</Text>
      </Box>
    </Box>
  );
});

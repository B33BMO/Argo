import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { icon } from '../utils/icons.js';

interface StatusBarProps {
  modelName?: string;
  provider?: string;
  isConnected?: boolean;
  tokenCount?: number;
  responseTime?: number;
  isLoading?: boolean;
}

export function StatusBar({
  modelName = 'Unknown',
  provider = 'Unknown',
  isConnected = true,
  tokenCount,
  responseTime,
  isLoading = false,
}: StatusBarProps) {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const timeStr = time.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  // Truncate model name if too long
  const displayModel = modelName.length > 30
    ? modelName.slice(0, 27) + '...'
    : modelName;

  return (
    <Box
      borderStyle="single"
      borderColor="gray"
      paddingX={1}
      justifyContent="space-between"
    >
      {/* Left side: Provider & Model */}
      <Box>
        <Text color="gray">{icon('bolt')} </Text>
        <Text color="cyan">{provider}</Text>
        <Text color="gray"> │ </Text>
        <Text color="green">{displayModel}</Text>
      </Box>

      {/* Center: Status indicators */}
      <Box>
        {isLoading && (
          <>
            <Text color="yellow">{icon('running')} </Text>
            <Text color="yellow">Working</Text>
          </>
        )}
        {!isLoading && isConnected && (
          <>
            <Text color="green">{icon('success')} </Text>
            <Text color="green">Ready</Text>
          </>
        )}
        {!isLoading && !isConnected && (
          <>
            <Text color="red">{icon('error')} </Text>
            <Text color="red">Disconnected</Text>
          </>
        )}
      </Box>

      {/* Right side: Stats & Time */}
      <Box>
        {tokenCount !== undefined && (
          <>
            <Text color="gray">{icon('dot')} </Text>
            <Text color="white">{tokenCount.toLocaleString()}</Text>
            <Text color="gray"> tokens │ </Text>
          </>
        )}
        {responseTime !== undefined && (
          <>
            <Text color="gray">{icon('clock')} </Text>
            <Text color="white">{(responseTime / 1000).toFixed(1)}s</Text>
            <Text color="gray"> │ </Text>
          </>
        )}
        <Text color="gray">{timeStr}</Text>
      </Box>
    </Box>
  );
}

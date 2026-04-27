import React from 'react';
import { Box, Text } from 'ink';
import { icon } from '../utils/icons.js';
import {
  calculateContextUsage,
  formatTokenCount,
  getContextWarningLevel,
  type ContextWindowInfo,
} from '../utils/tokens.js';

interface ContextIndicatorProps {
  messages: { role: string; content: string }[];
  modelName: string;
  showBreakdown?: boolean;
}

export function ContextIndicator({
  messages,
  modelName,
  showBreakdown = false,
}: ContextIndicatorProps) {
  const info = calculateContextUsage(messages, modelName);
  const level = getContextWarningLevel(info.percentUsed);

  const levelColors = {
    safe: 'green',
    warning: 'yellow',
    danger: 'red',
  };

  const color = levelColors[level];

  return (
    <Box flexDirection="column">
      {/* Main indicator */}
      <Box>
        <Text color={color}>{icon('dot')} </Text>
        <Text color={color}>
          {formatTokenCount(info.usedTokens)} / {formatTokenCount(info.maxTokens)}
        </Text>
        <Text color="gray"> tokens </Text>
        <Text color={color}>({info.percentUsed.toFixed(1)}%)</Text>
      </Box>

      {/* Progress bar */}
      <Box marginLeft={2}>
        <ProgressBar percent={info.percentUsed} width={30} color={color} />
      </Box>

      {/* Breakdown */}
      {showBreakdown && (
        <Box flexDirection="column" marginLeft={2} marginTop={1}>
          <Text color="gray" dimColor>
            System: {formatTokenCount(info.breakdown.system)} ·
            User: {formatTokenCount(info.breakdown.user)} ·
            Assistant: {formatTokenCount(info.breakdown.assistant)}
            {info.breakdown.tool > 0 && ` · Tool: ${formatTokenCount(info.breakdown.tool)}`}
          </Text>
        </Box>
      )}
    </Box>
  );
}

interface ProgressBarProps {
  percent: number;
  width?: number;
  color?: string;
}

function ProgressBar({ percent, width = 20, color = 'green' }: ProgressBarProps) {
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;

  return (
    <Box>
      <Text color="gray">[</Text>
      <Text color={color as any}>{'█'.repeat(filled)}</Text>
      <Text color="gray">{'░'.repeat(empty)}</Text>
      <Text color="gray">]</Text>
    </Box>
  );
}

// Compact inline version
interface ContextBadgeProps {
  messages: { role: string; content: string }[];
  modelName: string;
}

export function ContextBadge({ messages, modelName }: ContextBadgeProps) {
  const info = calculateContextUsage(messages, modelName);
  const level = getContextWarningLevel(info.percentUsed);

  const levelColors = {
    safe: 'green',
    warning: 'yellow',
    danger: 'red',
  };

  return (
    <Box>
      <Text color={levelColors[level]}>
        {formatTokenCount(info.usedTokens)}/{formatTokenCount(info.maxTokens)}
      </Text>
    </Box>
  );
}

// Warning banner when context is nearly full
interface ContextWarningProps {
  info: ContextWindowInfo;
}

export function ContextWarning({ info }: ContextWarningProps) {
  const level = getContextWarningLevel(info.percentUsed);

  if (level === 'safe') return null;

  const message =
    level === 'danger'
      ? 'Context nearly full! Consider starting a new session.'
      : 'Context usage high. Consider clearing history soon.';

  return (
    <Box
      borderStyle="round"
      borderColor={level === 'danger' ? 'red' : 'yellow'}
      paddingX={1}
      marginY={1}
    >
      <Text color={level === 'danger' ? 'red' : 'yellow'}>
        {icon('warning')} {message}
      </Text>
    </Box>
  );
}

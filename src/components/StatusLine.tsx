import React, { memo } from 'react';
import { Box, Text } from 'ink';
import { Spinner } from './Spinner.js';
import { Sparkline } from './Sparkline.js';
import {
  calculateContextUsage,
  formatTokenCount,
  getContextWarningLevel,
} from '../utils/tokens.js';
import { getWorkspace, formatWorkspaceShort } from '../utils/workspace.js';
import type { Message } from '../providers/types.js';
import type { GitStatus } from '../utils/git.js';

interface StatusLineProps {
  provider: string;
  model: string;
  isLoading: boolean;
  responseTime?: number;
  messages: Message[];
  gitStatus: GitStatus | null;
  sessionLabel?: string;
}

export const StatusLine = memo(function StatusLine({
  provider,
  model,
  isLoading,
  responseTime,
  messages,
  gitStatus,
  sessionLabel = 'local',
}: StatusLineProps) {
  const ctx = calculateContextUsage(messages, model);
  const ctxLevel = getContextWarningLevel(ctx.percentUsed);
  const ctxColor = ctxLevel === 'danger' ? 'red' : ctxLevel === 'warning' ? 'yellow' : 'green';

  const truncModel = model.length > 28 ? model.slice(0, 25) + '...' : model;

  return (
    <Box flexDirection="column" marginTop={1}>
      {/* Top accent line */}
      <Text color="gray">{'─'.repeat(80)}</Text>

      <Box paddingX={1} justifyContent="space-between">
        {/* Left: provider · model */}
        <Box>
          <Text color="magenta" bold>◆ </Text>
          <Text color="cyan" bold>{provider}</Text>
          <Text color="gray"> · </Text>
          <Text color="white">{truncModel}</Text>
        </Box>

        {/* Center: cwd + git + context */}
        <Box>
          <Text color="blue">⌂ </Text>
          <Text color="white" bold>{formatWorkspaceShort(getWorkspace())}</Text>
          <Text color="gray">  </Text>
          {sessionLabel !== 'local' && (
            <>
              <Text color="red">⚡ </Text>
              <Text color="red" bold>{sessionLabel}</Text>
              <Text color="gray">  </Text>
            </>
          )}
          {gitStatus?.isRepo && (
            <>
              <Text color="magenta">⎇ </Text>
              <Text color="white" bold>{gitStatus.branch}</Text>
              {(gitStatus.staged.length + gitStatus.unstaged.length + gitStatus.untracked.length) > 0 && (
                <Text color="yellow">
                  {' '}*{gitStatus.staged.length + gitStatus.unstaged.length + gitStatus.untracked.length}
                </Text>
              )}
              <Text color="gray">  </Text>
            </>
          )}
          <Text color={ctxColor} bold>
            {formatTokenCount(ctx.usedTokens)}
          </Text>
          <Text color="gray">/</Text>
          <Text color="white">{formatTokenCount(ctx.maxTokens)}</Text>
        </Box>

        {/* Right: status */}
        <Box>
          {isLoading ? (
            <>
              <Spinner color="yellow" />
              <Text color="yellow" bold> working </Text>
              <Sparkline active={isLoading} />
            </>
          ) : responseTime !== undefined ? (
            <>
              <Text color="green" bold>✓ </Text>
              <Text color="white">{(responseTime / 1000).toFixed(1)}s</Text>
            </>
          ) : (
            <>
              <Text color="green" bold>● </Text>
              <Text color="white">ready</Text>
            </>
          )}
        </Box>
      </Box>
    </Box>
  );
});

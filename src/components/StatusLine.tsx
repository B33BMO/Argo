import React, { memo } from 'react';
import { Box, Text } from 'ink';
import { Spinner } from './Spinner.js';
import {
  calculateContextUsage,
  formatTokenCount,
  getContextWarningLevel,
} from '../utils/tokens.js';
import type { Message } from '../providers/types.js';
import type { GitStatus } from '../utils/git.js';

interface StatusLineProps {
  provider: string;
  model: string;
  isLoading: boolean;
  responseTime?: number;
  messages: Message[];
  gitStatus: GitStatus | null;
}

export const StatusLine = memo(function StatusLine({
  provider,
  model,
  isLoading,
  responseTime,
  messages,
  gitStatus,
}: StatusLineProps) {
  const ctx = calculateContextUsage(messages, model);
  const ctxLevel = getContextWarningLevel(ctx.percentUsed);
  const ctxColor = ctxLevel === 'danger' ? 'red' : ctxLevel === 'warning' ? 'yellow' : 'green';

  const truncModel = model.length > 30 ? model.slice(0, 27) + '...' : model;

  return (
    <Box paddingX={1} justifyContent="space-between" marginTop={1}>
      <Box>
        <Text color="cyan" dimColor>{provider}</Text>
        <Text color="gray" dimColor> · </Text>
        <Text color="green" dimColor>{truncModel}</Text>
      </Box>

      <Box>
        {gitStatus?.isRepo && (
          <>
            <Text color="magenta" dimColor>{gitStatus.branch}</Text>
            {(gitStatus.staged.length + gitStatus.unstaged.length + gitStatus.untracked.length) > 0 && (
              <Text color="yellow" dimColor>
                {' '}*{gitStatus.staged.length + gitStatus.unstaged.length + gitStatus.untracked.length}
              </Text>
            )}
            <Text color="gray" dimColor> · </Text>
          </>
        )}
        <Text color={ctxColor} dimColor>
          {formatTokenCount(ctx.usedTokens)}/{formatTokenCount(ctx.maxTokens)}
        </Text>
      </Box>

      <Box>
        {isLoading ? (
          <>
            <Spinner color="yellow" />
            <Text color="yellow" dimColor> working</Text>
          </>
        ) : responseTime !== undefined ? (
          <Text color="gray" dimColor>{(responseTime / 1000).toFixed(1)}s</Text>
        ) : (
          <Text color="green" dimColor>ready</Text>
        )}
      </Box>
    </Box>
  );
});

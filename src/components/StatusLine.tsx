import React, { memo, useEffect, useMemo, useState } from 'react';
import { Box, Text, useStdout } from 'ink';
import { Spinner } from './Spinner.js';
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
  /** Peak tokens/sec from the last response — shown in the idle right-side. */
  lastTokensPerSec?: number;
}

// Width breakpoints — drop segments as the terminal narrows so nothing wraps.
const BP_WIDE = 120; // show everything
const BP_MED = 90;   // drop cwd
const BP_NARROW = 70; // drop cwd + git + provider label

function useTerminalWidth(): number {
  const { stdout } = useStdout();
  const [cols, setCols] = useState<number>(stdout?.columns ?? 80);
  useEffect(() => {
    if (!stdout) return;
    const onResize = () => setCols(stdout.columns ?? 80);
    stdout.on('resize', onResize);
    return () => { stdout.off('resize', onResize); };
  }, [stdout]);
  return cols;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, Math.max(0, max - 1)) + '…';
}

export const StatusLine = memo(function StatusLine({
  provider,
  model,
  isLoading,
  responseTime,
  messages,
  gitStatus,
  sessionLabel = 'local',
  lastTokensPerSec,
}: StatusLineProps) {
  const cols = useTerminalWidth();
  const ctx = useMemo(() => calculateContextUsage(messages, model), [messages, model]);
  const ctxLevel = getContextWarningLevel(ctx.percentUsed);
  const ctxColor = ctxLevel === 'danger' ? 'red' : ctxLevel === 'warning' ? 'yellow' : 'green';

  const showProvider = cols >= BP_NARROW;
  const showCwd = cols >= BP_WIDE;
  const showGit = cols >= BP_MED && !!gitStatus?.isRepo;

  // Budget: provider name carries identity (some labels include `·` already,
  // e.g. "llama.cpp · coleman-it"), so bias towards keeping it whole and
  // squeezing the model SKU instead.
  const modelBudget =
    cols >= BP_WIDE ? 28 : cols >= BP_MED ? 18 : cols >= BP_NARROW ? 14 : 10;
  const providerBudget =
    cols >= BP_WIDE ? 30 : cols >= BP_MED ? 24 : 18;
  const truncModel = truncate(model, modelBudget);
  const truncProvider = truncate(provider, providerBudget);

  // Subtract the surrounding padding so the rule never overflows and wraps.
  const ruleWidth = Math.max(20, Math.min(cols - 2, 120));

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color="gray">{'─'.repeat(ruleWidth)}</Text>

      <Box paddingX={1} justifyContent="space-between">
        {/* Left: provider · model */}
        <Box>
          <Text color="magenta" bold>◆ </Text>
          {showProvider && (
            <>
              <Text color="cyan" bold>{truncProvider}</Text>
              <Text color="gray"> · </Text>
            </>
          )}
          <Text color="white">{truncModel}</Text>
        </Box>

        {/* Center: cwd? git? context */}
        <Box>
          {showCwd && (
            <>
              <Text color="blue">⌂ </Text>
              <Text color="white" bold>{formatWorkspaceShort(getWorkspace())}</Text>
              <Text color="gray">  </Text>
            </>
          )}
          {sessionLabel !== 'local' && (
            <>
              <Text color="red">⚡ </Text>
              <Text color="red" bold>{sessionLabel}</Text>
              <Text color="gray">  </Text>
            </>
          )}
          {showGit && gitStatus && (
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
          <Text color={ctxColor} bold>{formatTokenCount(ctx.usedTokens)}</Text>
          <Text color="gray">/</Text>
          <Text color="white">{formatTokenCount(ctx.maxTokens)}</Text>
        </Box>

        {/* Right: post-turn summary only — pills carry the in-flight signal. */}
        <Box>
          {isLoading ? (
            <>
              <Spinner color="yellow" />
              <Text color="yellow" dimColor> streaming</Text>
            </>
          ) : responseTime !== undefined ? (
            <>
              <Text color="green" bold>✓ </Text>
              <Text color="white">{(responseTime / 1000).toFixed(1)}s</Text>
              {lastTokensPerSec !== undefined && lastTokensPerSec > 0 && cols >= BP_NARROW && (
                <>
                  <Text color="gray"> · </Text>
                  <Text color="cyan">
                    {lastTokensPerSec >= 100
                      ? `${(lastTokensPerSec / 1000).toFixed(1)}k`
                      : lastTokensPerSec.toFixed(0)} t/s
                  </Text>
                </>
              )}
            </>
          ) : (
            <Text color="gray" dimColor>ready</Text>
          )}
        </Box>
      </Box>
    </Box>
  );
});

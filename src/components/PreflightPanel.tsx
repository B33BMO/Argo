import React, { useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { Spinner } from './Spinner.js';
import { runPreflight, type PreflightCheck } from '../utils/preflight.js';
import type { LLMProvider } from '../providers/types.js';

interface PreflightPanelProps {
  isOpen: boolean;
  onClose: () => void;
  provider: LLMProvider;
}

const STATUS_GLYPH = {
  ok: { color: 'green', char: '●' },
  warn: { color: 'yellow', char: '◐' },
  fail: { color: 'red', char: '✗' },
  pending: { color: 'gray', char: '○' },
} as const;

export function PreflightPanel({ isOpen, onClose, provider }: PreflightPanelProps) {
  const [checks, setChecks] = useState<PreflightCheck[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setChecks([]);
    runPreflight(provider).then(c => {
      setChecks(c);
      setLoading(false);
    });
  }, [isOpen, provider]);

  useInput((input, key) => {
    if (!isOpen) return;
    if (key.escape || key.return || input === 'q') {
      onClose();
    }
    if (input === 'r') {
      setLoading(true);
      runPreflight(provider).then(c => {
        setChecks(c);
        setLoading(false);
      });
    }
  }, { isActive: isOpen });

  if (!isOpen) return null;

  const failed = checks.filter(c => c.status === 'fail').length;
  const warned = checks.filter(c => c.status === 'warn').length;
  const summaryColor = failed > 0 ? 'red' : warned > 0 ? 'yellow' : 'green';
  const summary = loading
    ? 'running checks...'
    : failed > 0
      ? `${failed} failed · ${warned} warning${warned === 1 ? '' : 's'}`
      : warned > 0
        ? `all clear · ${warned} warning${warned === 1 ? '' : 's'}`
        : 'all systems go';

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" padding={1} marginY={1}>
      <Box marginBottom={1}>
        <Text color="cyan" bold>✱ Preflight</Text>
        <Text color="gray"> · </Text>
        <Text color={summaryColor} bold>{summary}</Text>
      </Box>
      <Text color="gray">{'─'.repeat(50)}</Text>
      <Box flexDirection="column" marginTop={1}>
        {loading && checks.length === 0 ? (
          <Box>
            <Spinner color="cyan" />
            <Text color="gray"> probing...</Text>
          </Box>
        ) : (
          checks.map(c => {
            const g = STATUS_GLYPH[c.status];
            return (
              <Box key={c.id}>
                <Text color={g.color}>{g.char} </Text>
                <Box width={20}>
                  <Text color="white">{c.label}</Text>
                </Box>
                <Text color="gray" dimColor>{c.detail || ''}</Text>
              </Box>
            );
          })
        )}
      </Box>
      <Box marginTop={1}>
        <Text color="gray" dimColor>r refresh · Esc/Enter close</Text>
      </Box>
    </Box>
  );
}

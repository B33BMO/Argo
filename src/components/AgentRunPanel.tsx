import React, { memo, useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import { Spinner } from './Spinner.js';
import { useAnimationTick } from '../hooks/useThrottledValue.js';
import { subscribeToAgentEvents, type AgentEvent } from '../skills/agents.js';

interface AgentRun {
  runId: string;
  agentName: string;
  task: string;
  iteration: number;
  currentTool?: string;
  toolsUsed: string[];
  status: 'running' | 'success' | 'error';
  duration?: number;
  startTime: number;
  error?: string;
}

/**
 * Subscribes to global agent events and renders a live panel
 * showing every running agent (Claude Code-style fan-out view).
 */
export const AgentRunPanel = memo(function AgentRunPanel() {
  const [runs, setRuns] = useState<Map<string, AgentRun>>(new Map());

  useEffect(() => {
    const unsub = subscribeToAgentEvents((event: AgentEvent) => {
      setRuns(prev => {
        const next = new Map(prev);
        const existing = next.get(event.runId);

        switch (event.type) {
          case 'start':
            next.set(event.runId, {
              runId: event.runId,
              agentName: event.agentName,
              task: event.task,
              iteration: 0,
              toolsUsed: [],
              status: 'running',
              startTime: Date.now(),
            });
            break;

          case 'iteration':
            if (existing) {
              next.set(event.runId, { ...existing, iteration: event.iteration });
            }
            break;

          case 'tool_call':
            if (existing) {
              next.set(event.runId, {
                ...existing,
                currentTool: event.toolName,
                toolsUsed: existing.toolsUsed.includes(event.toolName)
                  ? existing.toolsUsed
                  : [...existing.toolsUsed, event.toolName],
              });
            }
            break;

          case 'tool_result':
            if (existing) {
              next.set(event.runId, { ...existing, currentTool: undefined });
            }
            break;

          case 'done':
            if (existing) {
              next.set(event.runId, {
                ...existing,
                status: event.result.success ? 'success' : 'error',
                duration: event.result.duration,
                error: event.result.error,
                currentTool: undefined,
              });
              // Auto-remove completed agents after 4s so panel doesn't pile up
              setTimeout(() => {
                setRuns(p => {
                  const m = new Map(p);
                  m.delete(event.runId);
                  return m;
                });
              }, 4000);
            }
            break;
        }

        return next;
      });
    });

    return unsub;
  }, []);

  if (runs.size === 0) return null;

  const runArray = Array.from(runs.values());
  const running = runArray.filter(r => r.status === 'running').length;

  return (
    <Box flexDirection="column" marginY={0} paddingLeft={2}>
      <Box>
        <Text color="magenta" bold>{'›'} agents</Text>
        <Text color="gray" dimColor>
          {' '}({running} running · {runArray.length} total)
        </Text>
      </Box>
      <Box flexDirection="column" marginLeft={2}>
        {runArray.map(run => (
          <AgentRunRow key={run.runId} run={run} />
        ))}
      </Box>
    </Box>
  );
});

interface AgentRunRowProps {
  run: AgentRun;
}

const AgentRunRow = memo(function AgentRunRow({ run }: AgentRunRowProps) {
  // Subscribe to shared tick so elapsed time updates live (only while running)
  useAnimationTick(run.status === 'running');
  const elapsed = run.duration ?? Date.now() - run.startTime;

  const statusDot = {
    running: { color: 'yellow', char: '●' },
    success: { color: 'green', char: '●' },
    error: { color: 'red', char: '●' },
  }[run.status];

  const taskPreview = run.task.length > 50
    ? run.task.slice(0, 47) + '...'
    : run.task;

  return (
    <Box flexDirection="column">
      <Box>
        {run.status === 'running' ? (
          <Spinner color="yellow" />
        ) : (
          <Text color={statusDot.color as any}>{statusDot.char}</Text>
        )}
        <Text color="magenta" bold> @{run.agentName}</Text>
        <Text color="gray" dimColor> · {taskPreview}</Text>
      </Box>
      <Box marginLeft={2}>
        <Text color="gray" dimColor>
          {run.status === 'running'
            ? `iter ${run.iteration}${run.currentTool ? ` · ${run.currentTool}` : ''} · ${(elapsed / 1000).toFixed(1)}s`
            : `${run.toolsUsed.length} tools · ${(elapsed / 1000).toFixed(1)}s${run.error ? ` · ${run.error.slice(0, 50)}` : ''}`}
        </Text>
      </Box>
    </Box>
  );
});

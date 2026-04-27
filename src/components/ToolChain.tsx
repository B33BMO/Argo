import React from 'react';
import { Box, Text } from 'ink';
import { icon } from '../utils/icons.js';
import { AnimatedSpinner } from './AnimatedSpinner.js';

export interface ToolChainStep {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'success' | 'error' | 'skipped';
  input?: string;
  output?: string;
  error?: string;
  duration?: number;
  children?: ToolChainStep[];
}

interface ToolChainProps {
  steps: ToolChainStep[];
  showDetails?: boolean;
  compact?: boolean;
}

export function ToolChain({
  steps,
  showDetails = false,
  compact = false,
}: ToolChainProps) {
  if (steps.length === 0) return null;

  return (
    <Box flexDirection="column">
      {steps.map((step, i) => (
        <ToolChainNode
          key={step.id}
          step={step}
          isLast={i === steps.length - 1}
          showDetails={showDetails}
          compact={compact}
          depth={0}
        />
      ))}
    </Box>
  );
}

interface ToolChainNodeProps {
  step: ToolChainStep;
  isLast: boolean;
  showDetails: boolean;
  compact: boolean;
  depth: number;
}

function ToolChainNode({
  step,
  isLast,
  showDetails,
  compact,
  depth,
}: ToolChainNodeProps) {
  const statusConfig = {
    pending: { color: 'gray', icon: 'pending' as const },
    running: { color: 'yellow', icon: 'running' as const },
    success: { color: 'green', icon: 'success' as const },
    error: { color: 'red', icon: 'error' as const },
    skipped: { color: 'gray', icon: 'pending' as const },
  };

  const config = statusConfig[step.status];
  const indent = '  '.repeat(depth);
  const connector = isLast ? '└' : '├';
  const line = isLast ? ' ' : '│';

  return (
    <Box flexDirection="column">
      {/* Main node */}
      <Box>
        <Text color="gray">{indent}{connector}─ </Text>
        {step.status === 'running' ? (
          <AnimatedSpinner style="dots" color="yellow" />
        ) : (
          <Text color={config.color as any}>{icon(config.icon)} </Text>
        )}
        <Text color={config.color as any} bold={step.status === 'running'}>
          {step.name}
        </Text>
        {step.duration !== undefined && step.status !== 'running' && (
          <Text color="gray" dimColor>
            {' '}({(step.duration / 1000).toFixed(2)}s)
          </Text>
        )}
      </Box>

      {/* Details */}
      {showDetails && !compact && (
        <Box flexDirection="column" marginLeft={depth * 2 + 4}>
          {step.input && (
            <Box>
              <Text color="gray" dimColor>
                {indent}{line}   Input: {truncate(step.input, 50)}
              </Text>
            </Box>
          )}
          {step.output && step.status === 'success' && (
            <Box>
              <Text color="gray" dimColor>
                {indent}{line}   Output: {truncate(step.output, 50)}
              </Text>
            </Box>
          )}
          {step.error && step.status === 'error' && (
            <Box>
              <Text color="red" dimColor>
                {indent}{line}   Error: {truncate(step.error, 50)}
              </Text>
            </Box>
          )}
        </Box>
      )}

      {/* Children (nested tool calls) */}
      {step.children && step.children.length > 0 && (
        <Box flexDirection="column" marginLeft={2}>
          {step.children.map((child, i) => (
            <ToolChainNode
              key={child.id}
              step={child}
              isLast={i === step.children!.length - 1}
              showDetails={showDetails}
              compact={compact}
              depth={depth + 1}
            />
          ))}
        </Box>
      )}
    </Box>
  );
}

function truncate(str: string, maxLen: number): string {
  const singleLine = str.replace(/\n/g, ' ');
  if (singleLine.length <= maxLen) return singleLine;
  return singleLine.slice(0, maxLen - 3) + '...';
}

// Timeline view for tool execution
interface ToolTimelineProps {
  steps: ToolChainStep[];
}

export function ToolTimeline({ steps }: ToolTimelineProps) {
  const totalDuration = steps.reduce((sum, s) => sum + (s.duration || 0), 0);

  return (
    <Box flexDirection="column" marginY={1}>
      <Box marginBottom={1}>
        <Text color="cyan" bold>Tool Execution Timeline</Text>
        <Text color="gray"> ({(totalDuration / 1000).toFixed(2)}s total)</Text>
      </Box>

      {/* Visual timeline */}
      <Box>
        {steps.map((step, i) => {
          const width = Math.max(
            3,
            Math.round(((step.duration || 0) / Math.max(totalDuration, 1)) * 40)
          );
          const statusColors = {
            pending: 'gray',
            running: 'yellow',
            success: 'green',
            error: 'red',
            skipped: 'gray',
          };

          return (
            <Box key={step.id} flexDirection="column" marginRight={1}>
              <Text color={statusColors[step.status] as any}>
                {'█'.repeat(width)}
              </Text>
              <Text color="gray" dimColor wrap="truncate">
                {step.name.slice(0, width)}
              </Text>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

// Summary badge
interface ToolSummaryProps {
  steps: ToolChainStep[];
}

export function ToolSummary({ steps }: ToolSummaryProps) {
  const counts = {
    success: steps.filter(s => s.status === 'success').length,
    error: steps.filter(s => s.status === 'error').length,
    running: steps.filter(s => s.status === 'running').length,
    pending: steps.filter(s => s.status === 'pending').length,
  };

  const total = steps.length;
  const completed = counts.success + counts.error;

  return (
    <Box>
      <Text color="gray">Tools: </Text>
      <Text color="green">{counts.success}✓</Text>
      {counts.error > 0 && <Text color="red"> {counts.error}✗</Text>}
      {counts.running > 0 && <Text color="yellow"> {counts.running}⋯</Text>}
      <Text color="gray"> ({completed}/{total})</Text>
    </Box>
  );
}

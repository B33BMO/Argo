import React, { memo } from 'react';
import { Box, Text } from 'ink';
import { Markdown } from './Markdown.js';
import { ToolCallCard } from './ToolCallCard.js';
import { Spinner } from './Spinner.js';
import type { Message } from '../providers/types.js';

export interface ToolStateEntry {
  status: 'pending' | 'running' | 'success' | 'error';
  result?: string;
  error?: string;
  startTime?: number;
  endTime?: number;
}

interface MessageBubbleProps {
  message: Message;
  hideHeader?: boolean;
  /** Globally toggled by ^T — expand all reasoning blocks. */
  showReasoning?: boolean;
  /** Per-call status, keyed by tool-call id. */
  toolStates?: Record<string, ToolStateEntry>;
  /** True when this is the most recent assistant turn — drives the cursor + the
   *  per-turn summary line that only renders for the latest turn. */
  isLatestAssistant?: boolean;
  /** Aggregated tool calls from every assistant message in this user turn —
   *  rendered as a closing summary on the latest assistant bubble. */
  turnToolCalls?: NonNullable<Message['toolCalls']>;
}

const ROLE_CONFIG = {
  user: { label: 'you', color: 'cyan' as const, dot: 'cyan' as const, glyph: '●' },
  assistant: { label: 'argo', color: 'white' as const, dot: 'green' as const, glyph: '▲' },
  system: { label: 'system', color: 'yellow' as const, dot: 'yellow' as const, glyph: '●' },
  tool: { label: 'tool', color: 'magenta' as const, dot: 'magenta' as const, glyph: '●' },
};

/**
 * Render one message — including, for assistant messages, all of its
 * sub-blocks: preamble text, tool cards, reasoning section, completion summary.
 *
 * The bubble keeps the same key from the moment streaming starts until the
 * turn settles. Nothing reflows. Nothing vanishes.
 */
export const MessageBubble = memo(
  function MessageBubble({
    message,
    hideHeader = false,
    showReasoning = false,
    toolStates = {},
    isLatestAssistant = false,
    turnToolCalls,
  }: MessageBubbleProps) {
    const config = ROLE_CONFIG[message.role] || ROLE_CONFIG.system;
    const isAssistant = message.role === 'assistant';
    const hasText = !!message.content?.trim();
    const hasReasoning = isAssistant && !!message.reasoning?.trim();
    const hasTools = isAssistant && (message.toolCalls?.length || 0) > 0;
    const isStreaming = !!message.streaming;

    // Empty bubble with nothing to show. Keep it if streaming so the cursor
    // has somewhere to land.
    if (!hasText && !hasReasoning && !hasTools && !isStreaming) return null;

    return (
      <Box flexDirection="column" marginY={0}>
        {!hideHeader && (
          <Box>
            <Text color={config.dot} bold>{config.glyph} </Text>
            <Text color={config.color} bold>{config.label}</Text>
          </Box>
        )}

        <Box flexDirection="column" marginLeft={2}>
          {/* Preamble text (or streaming cursor when empty) */}
          {hasText ? (
            isAssistant ? (
              <Box flexDirection="column">
                <Markdown>{message.content}</Markdown>
                {isStreaming && <Text color="green">▎</Text>}
              </Box>
            ) : (
              <Text color={config.color} wrap="wrap">{message.content}</Text>
            )
          ) : isStreaming && !hasReasoning && !hasTools ? (
            <Box>
              <Spinner color="yellow" />
              <Text color="gray" dimColor> thinking…</Text>
            </Box>
          ) : null}

          {/* Tool calls — pills, in stream order */}
          {hasTools && (
            <Box flexDirection="column">
              {message.toolCalls!.map(tc => {
                const st = toolStates[tc.id];
                const status = st?.status ?? (isStreaming ? 'running' : 'success');
                const duration =
                  st?.startTime && st?.endTime ? st.endTime - st.startTime : undefined;
                return (
                  <ToolCallCard
                    key={tc.id}
                    name={tc.name}
                    arguments={tc.arguments}
                    status={status}
                    result={st?.result}
                    error={st?.error}
                    duration={duration}
                  />
                );
              })}
            </Box>
          )}

          {/* Reasoning */}
          {hasReasoning && (
            <ReasoningSection
              text={message.reasoning!}
              expanded={showReasoning}
              isLatest={isLatestAssistant}
            />
          )}

          {/* Per-turn closing summary on the latest assistant bubble. Pulls
              from the aggregated turn-wide tool list so multi-iteration turns
              still show one consolidated summary. */}
          {isLatestAssistant && !isStreaming && (turnToolCalls?.length ?? 0) > 0 && (
            <TurnSummary toolCalls={turnToolCalls!} toolStates={toolStates} />
          )}
        </Box>
      </Box>
    );
  },
  (prev, next) =>
    prev.message.role === next.message.role &&
    prev.message.content === next.message.content &&
    prev.message.reasoning === next.message.reasoning &&
    prev.message.streaming === next.message.streaming &&
    prev.message.toolCalls?.length === next.message.toolCalls?.length &&
    prev.hideHeader === next.hideHeader &&
    prev.showReasoning === next.showReasoning &&
    prev.isLatestAssistant === next.isLatestAssistant &&
    prev.toolStates === next.toolStates &&
    prev.turnToolCalls?.length === next.turnToolCalls?.length
);

/** Build a tight one-paragraph summary out of the model's raw reasoning:
 *  drop bare XML tags, collapse whitespace, take up to ~3 sentences worth. */
function summarizeReasoning(text: string): string {
  const cleaned = text
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !/^<\/?[\w-]+(\s[^>]*)?>$/.test(l))
    .join(' ');
  if (!cleaned) return '';
  // First ~280 chars, broken at a sentence boundary if possible
  const cap = 280;
  if (cleaned.length <= cap) return cleaned;
  const slice = cleaned.slice(0, cap);
  const lastDot = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('? '), slice.lastIndexOf('! '));
  return (lastDot > cap * 0.6 ? slice.slice(0, lastDot + 1) : slice) + '…';
}

function ReasoningSection({
  text,
  expanded,
  isLatest,
}: {
  text: string;
  expanded: boolean;
  isLatest: boolean;
}) {
  const summary = summarizeReasoning(text);
  const totalLines = text.split('\n').filter(l => l.trim()).length;

  // Compact inline form for the latest turn — a paragraph the user can read
  // at a glance. Older turns or empty cleanups fall back to the meta-only line.
  if (isLatest && summary && !expanded) {
    return (
      <Box flexDirection="row" marginY={1} marginLeft={2}>
        <Text color="yellow">◐ </Text>
        <Box flexDirection="column" flexShrink={1}>
          <Text color="white" wrap="wrap">
            <Text color="yellow" bold>Reasoning: </Text>
            <Text color="gray">{summary}</Text>
          </Text>
          {totalLines > 3 && (
            <Text color="gray" dimColor>^T for full {totalLines} lines</Text>
          )}
        </Box>
      </Box>
    );
  }

  if (!expanded) {
    return (
      <Box marginTop={1} marginLeft={2}>
        <Text color="yellow" dimColor>
          ◐ {totalLines} line{totalLines === 1 ? '' : 's'} of reasoning · ^T to show
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginY={1} marginLeft={2}>
      <Text color="yellow" bold>◐ Reasoning</Text>
      <Box flexDirection="column" marginLeft={2} marginTop={0}>
        {text.split('\n').map((line, i) => (
          <Text key={i} color="gray" dimColor wrap="wrap">
            {line || ' '}
          </Text>
        ))}
      </Box>
    </Box>
  );
}

/** End-of-turn summary derived from the actual tool results. */
function TurnSummary({
  toolCalls,
  toolStates,
}: {
  toolCalls: NonNullable<Message['toolCalls']>;
  toolStates: Record<string, ToolStateEntry>;
}) {
  const writes: string[] = [];
  let bashRuns = 0;
  let bashFails = 0;
  let reads = 0;
  let errors = 0;

  for (const tc of toolCalls) {
    const st = toolStates[tc.id];
    if (st?.status === 'error') errors++;
    if (tc.name === 'write_file' || tc.name === 'edit_file') {
      const path = (tc.arguments?.path ?? '') as string;
      if (path && st?.status === 'success') writes.push(path);
    }
    if (tc.name === 'bash') {
      bashRuns++;
      if (st?.status === 'error') bashFails++;
    }
    if (tc.name === 'read_file' || tc.name === 'list_dir' || tc.name === 'glob' || tc.name === 'grep') {
      reads++;
    }
  }

  const bits: React.ReactNode[] = [];
  if (writes.length > 0) {
    const preview = writes.slice(0, 3).map(p => p.split('/').slice(-2).join('/')).join(', ');
    const more = writes.length > 3 ? ` (+${writes.length - 3} more)` : '';
    bits.push(
      <Box key="w">
        <Text color="green" bold>✓ </Text>
        <Text color="white">{writes.length} file{writes.length === 1 ? '' : 's'} written</Text>
        <Text color="gray" dimColor>  → {preview}{more}</Text>
      </Box>
    );
  }
  if (bashRuns > 0) {
    bits.push(
      <Box key="b">
        <Text color={bashFails > 0 ? 'yellow' : 'green'} bold>{bashFails > 0 ? '! ' : '✓ '}</Text>
        <Text color="white">{bashRuns} command{bashRuns === 1 ? '' : 's'} run</Text>
        {bashFails > 0 && <Text color="yellow" dimColor>  · {bashFails} failed</Text>}
      </Box>
    );
  }
  if (errors > 0) {
    bits.push(
      <Box key="e">
        <Text color="red" bold>✗ </Text>
        <Text color="white">{errors} tool error{errors === 1 ? '' : 's'}</Text>
      </Box>
    );
  }
  if (bits.length === 0 && reads > 0) {
    bits.push(
      <Box key="r">
        <Text color="gray" dimColor>· {reads} file{reads === 1 ? '' : 's'} inspected</Text>
      </Box>
    );
  }

  if (bits.length === 0) return null;
  return (
    <Box flexDirection="column" marginTop={1} marginLeft={2}>
      {bits}
    </Box>
  );
}

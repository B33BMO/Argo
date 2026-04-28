import React, { memo } from 'react';
import { Box, Text } from 'ink';
import type { Suggestion } from '../utils/suggestions.js';

interface SuggestionsPanelProps {
  suggestions: Suggestion[];
  /** 0-based index of the currently highlighted suggestion (cycled with Ctrl+J). */
  activeIndex: number;
}

/**
 * Renders a compact list of inline code-suggestion markers under the last
 * assistant message. The user cycles with Ctrl+J and accepts with Ctrl+F to
 * send the fix prompt to Argo.
 */
export const SuggestionsPanel = memo(function SuggestionsPanel({
  suggestions,
  activeIndex,
}: SuggestionsPanelProps) {
  if (suggestions.length === 0) return null;

  return (
    <Box flexDirection="column" marginY={0} paddingLeft={2}>
      <Box>
        <Text color="yellow" bold>✱ suggestions</Text>
        <Text color="gray" dimColor>
          {' '}({suggestions.length}) · ^J cycle · ^F apply
        </Text>
      </Box>
      <Box flexDirection="column" marginLeft={2}>
        {suggestions.map((s, i) => {
          const isActive = i === activeIndex;
          return (
            <Box key={s.id}>
              <Text color={isActive ? 'yellow' : 'gray'} bold={isActive}>
                {isActive ? '✱' : '·'}{' '}
              </Text>
              <Text color={isActive ? 'yellow' : 'white'} bold={isActive}>
                {s.label}
              </Text>
              <Text color="gray" dimColor>
                {' '}— {s.snippet.trim().slice(0, 50)}
                {s.snippet.length > 50 ? '…' : ''}
              </Text>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
});

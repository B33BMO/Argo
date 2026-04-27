import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { icon } from '../utils/icons.js';
import { highlightCode, detectLanguage } from '../utils/syntax.js';

interface CollapsibleOutputProps {
  content: string;
  title?: string;
  language?: string;
  maxCollapsedLines?: number;
  defaultCollapsed?: boolean;
  showLineNumbers?: boolean;
  borderColor?: string;
}

export function CollapsibleOutput({
  content,
  title,
  language,
  maxCollapsedLines = 8,
  defaultCollapsed = false,
  showLineNumbers = true,
  borderColor = 'gray',
}: CollapsibleOutputProps) {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

  const lines = content.split('\n');
  const totalLines = lines.length;
  const shouldTruncate = isCollapsed && totalLines > maxCollapsedLines;
  const displayLines = shouldTruncate ? lines.slice(0, maxCollapsedLines) : lines;

  // Auto-detect language if not provided
  const detectedLang = language || detectLanguage(content, title);

  // Apply syntax highlighting
  const highlightedLines = detectedLang
    ? highlightCode(displayLines.join('\n'), detectedLang).split('\n')
    : displayLines;

  const lineNumWidth = totalLines.toString().length;

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={borderColor as any}>
      {/* Header */}
      <Box
        paddingX={1}
        justifyContent="space-between"
        borderStyle="single"
        borderBottom
        borderTop={false}
        borderLeft={false}
        borderRight={false}
        borderColor="gray"
      >
        <Box>
          {title && (
            <>
              <Text color={borderColor as any}>{icon('file')} </Text>
              <Text color={borderColor as any} bold>
                {title}
              </Text>
            </>
          )}
          {detectedLang && (
            <Text color="gray" dimColor>
              {title ? ' · ' : ''}{detectedLang}
            </Text>
          )}
          <Text color="gray" dimColor>
            {' '}({totalLines} lines)
          </Text>
        </Box>
        <Box>
          <Text
            color="gray"
            dimColor
            // Note: Click handling would need ink's click support
          >
            {icon(isCollapsed ? 'chevronRight' : 'chevronDown')} {isCollapsed ? 'expand' : 'collapse'}
          </Text>
        </Box>
      </Box>

      {/* Content */}
      <Box flexDirection="column" paddingX={1}>
        {highlightedLines.map((line, i) => (
          <Box key={i}>
            {showLineNumbers && (
              <Text color="gray" dimColor>
                {(i + 1).toString().padStart(lineNumWidth, ' ')} │
              </Text>
            )}
            <Text wrap="truncate-end">{line}</Text>
          </Box>
        ))}

        {shouldTruncate && (
          <Box marginTop={1}>
            <Text color="gray" dimColor>
              {icon('chevronDown')} {totalLines - maxCollapsedLines} more lines...
            </Text>
          </Box>
        )}
      </Box>
    </Box>
  );
}

// Simple expandable text for inline use
interface ExpandableTextProps {
  content: string;
  maxLength?: number;
}

export function ExpandableText({ content, maxLength = 100 }: ExpandableTextProps) {
  const [expanded, setExpanded] = useState(false);

  if (content.length <= maxLength) {
    return <Text>{content}</Text>;
  }

  return (
    <Box flexDirection="column">
      <Text>
        {expanded ? content : content.slice(0, maxLength) + '...'}
      </Text>
      <Text color="cyan" dimColor>
        [{expanded ? 'less' : 'more'}]
      </Text>
    </Box>
  );
}

// Output panel with copy support
interface OutputPanelProps {
  content: string;
  title?: string;
  status?: 'success' | 'error' | 'info';
  showCopyHint?: boolean;
}

export function OutputPanel({
  content,
  title,
  status = 'info',
  showCopyHint = true,
}: OutputPanelProps) {
  const statusColors = {
    success: 'green',
    error: 'red',
    info: 'blue',
  };

  const statusIcons = {
    success: 'success',
    error: 'error',
    info: 'info',
  } as const;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={statusColors[status] as any}
      paddingX={1}
      marginY={1}
    >
      {/* Header */}
      <Box justifyContent="space-between">
        <Box>
          <Text color={statusColors[status] as any}>
            {icon(statusIcons[status])}{' '}
          </Text>
          <Text color={statusColors[status] as any} bold>
            {title || 'Output'}
          </Text>
        </Box>
        {showCopyHint && (
          <Text color="gray" dimColor>
            Ctrl+C to copy
          </Text>
        )}
      </Box>

      {/* Content */}
      <Box marginTop={1}>
        <Text wrap="wrap">{content}</Text>
      </Box>
    </Box>
  );
}

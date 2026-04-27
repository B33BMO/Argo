import React, { useState } from 'react';
import { Box, Text } from 'ink';
import { icon } from '../utils/icons.js';
import type { FileDiff, DiffHunk, DiffLine } from '../utils/diff.js';

interface DiffViewProps {
  diff: FileDiff;
  filePath?: string;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  maxLines?: number;
}

export function DiffView({
  diff,
  filePath,
  isCollapsed = false,
  onToggleCollapse,
  maxLines = 20,
}: DiffViewProps) {
  const totalLines = diff.hunks.reduce((sum, h) => sum + h.lines.length, 0);
  const shouldTruncate = totalLines > maxLines;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      marginY={1}
    >
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
          <Text color="cyan">{icon('edit')} </Text>
          <Text color="cyan" bold>
            {filePath || 'File Changes'}
          </Text>
          <Text color="gray"> </Text>
          <Text color="green">+{diff.additions}</Text>
          <Text color="gray">/</Text>
          <Text color="red">-{diff.deletions}</Text>
        </Box>
        {onToggleCollapse && (
          <Box>
            <Text color="gray" dimColor>
              {icon(isCollapsed ? 'chevronRight' : 'chevronDown')}
            </Text>
          </Box>
        )}
      </Box>

      {/* Content */}
      {!isCollapsed && (
        <Box flexDirection="column" paddingX={1}>
          {diff.hunks.map((hunk, i) => (
            <HunkView key={i} hunk={hunk} maxLines={shouldTruncate ? Math.floor(maxLines / diff.hunks.length) : undefined} />
          ))}
          {shouldTruncate && (
            <Text color="gray" dimColor>
              ... {totalLines - maxLines} more lines
            </Text>
          )}
        </Box>
      )}

      {/* Collapsed state */}
      {isCollapsed && (
        <Box paddingX={1}>
          <Text color="gray" dimColor>
            ··· {totalLines} lines changed ···
          </Text>
        </Box>
      )}
    </Box>
  );
}

interface HunkViewProps {
  hunk: DiffHunk;
  maxLines?: number;
}

function HunkView({ hunk, maxLines }: HunkViewProps) {
  const displayLines = maxLines ? hunk.lines.slice(0, maxLines) : hunk.lines;
  const truncated = maxLines && hunk.lines.length > maxLines;

  return (
    <Box flexDirection="column">
      {/* Hunk header */}
      <Text color="cyan" dimColor>
        @@ -{hunk.oldStart},{hunk.oldCount} +{hunk.newStart},{hunk.newCount} @@
      </Text>

      {/* Lines */}
      {displayLines.map((line, i) => (
        <DiffLineView key={i} line={line} />
      ))}

      {truncated && (
        <Text color="gray" dimColor>
          ... {hunk.lines.length - maxLines!} more lines in hunk
        </Text>
      )}
    </Box>
  );
}

interface DiffLineViewProps {
  line: DiffLine;
}

function DiffLineView({ line }: DiffLineViewProps) {
  const color = line.type === 'add' ? 'green' : line.type === 'remove' ? 'red' : 'gray';
  const prefix = line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' ';
  const bgColor = line.type === 'add' ? 'greenBright' : line.type === 'remove' ? 'redBright' : undefined;

  // Line numbers
  const oldNum = line.oldLineNum?.toString().padStart(4, ' ') || '    ';
  const newNum = line.newLineNum?.toString().padStart(4, ' ') || '    ';

  return (
    <Box>
      <Text color="gray" dimColor>
        {line.type === 'remove' ? oldNum : '    '}
        {line.type === 'add' ? newNum : line.type === 'context' ? newNum : '    '}
      </Text>
      <Text color={color} bold={line.type !== 'context'}>
        {prefix}
      </Text>
      <Text color={color} dimColor={line.type === 'context'}>
        {line.content}
      </Text>
    </Box>
  );
}

// Inline diff for small changes (single line)
interface InlineDiffProps {
  oldText: string;
  newText: string;
}

export function InlineDiff({ oldText, newText }: InlineDiffProps) {
  return (
    <Box flexDirection="column">
      <Box>
        <Text color="red">- </Text>
        <Text color="red" strikethrough>
          {oldText}
        </Text>
      </Box>
      <Box>
        <Text color="green">+ </Text>
        <Text color="green" bold>
          {newText}
        </Text>
      </Box>
    </Box>
  );
}

// Summary badge for diffs
interface DiffBadgeProps {
  additions: number;
  deletions: number;
}

export function DiffBadge({ additions, deletions }: DiffBadgeProps) {
  return (
    <Box>
      <Text color="green">+{additions}</Text>
      <Text color="gray">/</Text>
      <Text color="red">-{deletions}</Text>
    </Box>
  );
}

import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { icon } from '../utils/icons.js';
import {
  getGitStatus,
  formatStatusLine,
  getStatusColor,
  type GitStatus,
  type FileStatus,
} from '../utils/git.js';

interface GitPanelProps {
  cwd?: string;
  refreshInterval?: number;
  compact?: boolean;
}

export function GitPanel({
  cwd = process.cwd(),
  refreshInterval = 5000,
  compact = false,
}: GitPanelProps) {
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const refresh = async () => {
      const newStatus = await getGitStatus(cwd);
      if (mounted) {
        setStatus(newStatus);
        setLoading(false);
      }
    };

    refresh();
    const interval = setInterval(refresh, refreshInterval);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [cwd, refreshInterval]);

  if (loading) {
    return (
      <Box>
        <Text color="gray" dimColor>Loading git status...</Text>
      </Box>
    );
  }

  if (!status?.isRepo) {
    return null; // Not a git repo, don't show anything
  }

  if (compact) {
    return <GitBadge status={status} />;
  }

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1}>
      {/* Header */}
      <Box justifyContent="space-between">
        <Box>
          <Text color="magenta">{icon('folder')} </Text>
          <Text color="magenta" bold>git</Text>
          <Text color="gray"> │ </Text>
          <Text color="cyan">{status.branch}</Text>
        </Box>
        {(status.ahead > 0 || status.behind > 0) && (
          <Box>
            {status.ahead > 0 && (
              <Text color="green">↑{status.ahead}</Text>
            )}
            {status.behind > 0 && (
              <Text color="red">↓{status.behind}</Text>
            )}
          </Box>
        )}
      </Box>

      {/* Staged changes */}
      {status.staged.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="green" bold>Staged ({status.staged.length})</Text>
          {status.staged.slice(0, 5).map((file, i) => (
            <FileStatusLine key={i} file={file} />
          ))}
          {status.staged.length > 5 && (
            <Text color="gray" dimColor>  ...and {status.staged.length - 5} more</Text>
          )}
        </Box>
      )}

      {/* Unstaged changes */}
      {status.unstaged.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="yellow" bold>Modified ({status.unstaged.length})</Text>
          {status.unstaged.slice(0, 5).map((file, i) => (
            <FileStatusLine key={i} file={file} />
          ))}
          {status.unstaged.length > 5 && (
            <Text color="gray" dimColor>  ...and {status.unstaged.length - 5} more</Text>
          )}
        </Box>
      )}

      {/* Untracked files */}
      {status.untracked.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="gray">Untracked ({status.untracked.length})</Text>
          {status.untracked.slice(0, 3).map((file, i) => (
            <Box key={i} marginLeft={2}>
              <Text color="gray">? {file}</Text>
            </Box>
          ))}
          {status.untracked.length > 3 && (
            <Text color="gray" dimColor>  ...and {status.untracked.length - 3} more</Text>
          )}
        </Box>
      )}

      {/* Conflicts */}
      {status.conflicted.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="red" bold>Conflicts ({status.conflicted.length})</Text>
          {status.conflicted.map((file, i) => (
            <Box key={i} marginLeft={2}>
              <Text color="red">! {file}</Text>
            </Box>
          ))}
        </Box>
      )}

      {/* Clean state */}
      {!status.hasChanges && (
        <Box marginTop={1}>
          <Text color="green">{icon('success')} Working tree clean</Text>
        </Box>
      )}
    </Box>
  );
}

interface FileStatusLineProps {
  file: FileStatus;
}

function FileStatusLine({ file }: FileStatusLineProps) {
  const color = getStatusColor(file.status);

  return (
    <Box marginLeft={2}>
      <Text color={color as any}>{formatStatusLine(file)}</Text>
    </Box>
  );
}

// Compact badge for status bar
interface GitBadgeProps {
  status: GitStatus;
}

export function GitBadge({ status }: GitBadgeProps) {
  if (!status.isRepo) return null;

  const changes = status.staged.length + status.unstaged.length + status.untracked.length;
  const hasConflicts = status.conflicted.length > 0;

  return (
    <Box>
      <Text color="magenta">{icon('folder')} </Text>
      <Text color="cyan">{status.branch}</Text>
      {status.ahead > 0 && <Text color="green"> ↑{status.ahead}</Text>}
      {status.behind > 0 && <Text color="red"> ↓{status.behind}</Text>}
      {changes > 0 && <Text color="yellow"> *{changes}</Text>}
      {hasConflicts && <Text color="red"> !</Text>}
    </Box>
  );
}

// Inline branch indicator
export function BranchIndicator({ cwd }: { cwd?: string }) {
  const [branch, setBranch] = useState<string>('');

  useEffect(() => {
    getGitStatus(cwd).then(status => {
      if (status.isRepo) {
        setBranch(status.branch);
      }
    });
  }, [cwd]);

  if (!branch) return null;

  return (
    <Box>
      <Text color="magenta">{icon('folder')}</Text>
      <Text color="cyan">{branch}</Text>
    </Box>
  );
}

// Git integration utilities
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface GitStatus {
  isRepo: boolean;
  branch: string;
  ahead: number;
  behind: number;
  staged: FileStatus[];
  unstaged: FileStatus[];
  untracked: string[];
  hasChanges: boolean;
  conflicted: string[];
}

export interface FileStatus {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'copied';
  oldPath?: string; // For renames
}

export interface GitCommit {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  date: Date;
}

// Check if current directory is a git repo
export async function isGitRepo(cwd: string = process.cwd()): Promise<boolean> {
  try {
    await execAsync('git rev-parse --git-dir', { cwd });
    return true;
  } catch {
    return false;
  }
}

// Get current branch name
export async function getCurrentBranch(cwd: string = process.cwd()): Promise<string> {
  try {
    const { stdout } = await execAsync('git branch --show-current', { cwd });
    return stdout.trim() || 'HEAD';
  } catch {
    return 'unknown';
  }
}

// Get full git status
export async function getGitStatus(cwd: string = process.cwd()): Promise<GitStatus> {
  const status: GitStatus = {
    isRepo: false,
    branch: '',
    ahead: 0,
    behind: 0,
    staged: [],
    unstaged: [],
    untracked: [],
    hasChanges: false,
    conflicted: [],
  };

  try {
    // Check if repo
    if (!(await isGitRepo(cwd))) {
      return status;
    }
    status.isRepo = true;

    // Get branch
    status.branch = await getCurrentBranch(cwd);

    // Get ahead/behind
    try {
      const { stdout: trackingInfo } = await execAsync(
        'git rev-list --left-right --count HEAD...@{upstream} 2>/dev/null',
        { cwd }
      );
      const [ahead, behind] = trackingInfo.trim().split(/\s+/).map(Number);
      status.ahead = ahead || 0;
      status.behind = behind || 0;
    } catch {
      // No upstream branch
    }

    // Get status
    const { stdout: statusOutput } = await execAsync('git status --porcelain=v1', { cwd });

    for (const line of statusOutput.split('\n')) {
      if (!line) continue;

      const indexStatus = line[0];
      const workStatus = line[1];
      const filePath = line.slice(3);

      // Parse rename (old -> new)
      const renameParts = filePath.split(' -> ');
      const path = renameParts[renameParts.length - 1];
      const oldPath = renameParts.length > 1 ? renameParts[0] : undefined;

      // Staged changes (index)
      if (indexStatus !== ' ' && indexStatus !== '?') {
        const fileStatus = parseStatus(indexStatus, path, oldPath);
        if (fileStatus) status.staged.push(fileStatus);
      }

      // Unstaged changes (work tree)
      if (workStatus !== ' ' && workStatus !== '?') {
        const fileStatus = parseStatus(workStatus, path);
        if (fileStatus) status.unstaged.push(fileStatus);
      }

      // Untracked
      if (indexStatus === '?' && workStatus === '?') {
        status.untracked.push(path);
      }

      // Conflicts
      if (indexStatus === 'U' || workStatus === 'U') {
        status.conflicted.push(path);
      }
    }

    status.hasChanges =
      status.staged.length > 0 ||
      status.unstaged.length > 0 ||
      status.untracked.length > 0;

    return status;
  } catch (error) {
    return status;
  }
}

function parseStatus(
  char: string,
  path: string,
  oldPath?: string
): FileStatus | null {
  const statusMap: Record<string, FileStatus['status']> = {
    A: 'added',
    M: 'modified',
    D: 'deleted',
    R: 'renamed',
    C: 'copied',
  };

  const status = statusMap[char];
  if (!status) return null;

  return { path, status, oldPath };
}

// Get recent commits
export async function getRecentCommits(
  count: number = 10,
  cwd: string = process.cwd()
): Promise<GitCommit[]> {
  try {
    const { stdout } = await execAsync(
      `git log -${count} --format="%H|%h|%s|%an|%ai"`,
      { cwd }
    );

    return stdout
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(line => {
        const [hash, shortHash, message, author, dateStr] = line.split('|');
        return {
          hash,
          shortHash,
          message,
          author,
          date: new Date(dateStr),
        };
      });
  } catch {
    return [];
  }
}

// Get diff for a file
export async function getFileDiff(
  filePath: string,
  staged: boolean = false,
  cwd: string = process.cwd()
): Promise<string> {
  try {
    const stagedFlag = staged ? '--staged' : '';
    const { stdout } = await execAsync(`git diff ${stagedFlag} -- "${filePath}"`, {
      cwd,
    });
    return stdout;
  } catch {
    return '';
  }
}

// Stage files
export async function stageFiles(
  files: string[],
  cwd: string = process.cwd()
): Promise<boolean> {
  try {
    const fileList = files.map(f => `"${f}"`).join(' ');
    await execAsync(`git add ${fileList}`, { cwd });
    return true;
  } catch {
    return false;
  }
}

// Unstage files
export async function unstageFiles(
  files: string[],
  cwd: string = process.cwd()
): Promise<boolean> {
  try {
    const fileList = files.map(f => `"${f}"`).join(' ');
    await execAsync(`git reset HEAD ${fileList}`, { cwd });
    return true;
  } catch {
    return false;
  }
}

// Create commit
export async function createCommit(
  message: string,
  cwd: string = process.cwd()
): Promise<{ success: boolean; hash?: string; error?: string }> {
  try {
    // Escape message for shell
    const escapedMessage = message.replace(/"/g, '\\"');
    const { stdout } = await execAsync(`git commit -m "${escapedMessage}"`, { cwd });

    // Extract commit hash from output
    const hashMatch = stdout.match(/\[[\w-]+ ([a-f0-9]+)\]/);
    const hash = hashMatch ? hashMatch[1] : undefined;

    return { success: true, hash };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Commit failed',
    };
  }
}

// Format status for display
export function formatStatusLine(file: FileStatus): string {
  const statusSymbols: Record<FileStatus['status'], string> = {
    added: '+',
    modified: '~',
    deleted: '-',
    renamed: '→',
    copied: '⧉',
  };

  const symbol = statusSymbols[file.status];
  if (file.oldPath) {
    return `${symbol} ${file.oldPath} → ${file.path}`;
  }
  return `${symbol} ${file.path}`;
}

// Get status color
export function getStatusColor(status: FileStatus['status']): string {
  const colors: Record<FileStatus['status'], string> = {
    added: 'green',
    modified: 'yellow',
    deleted: 'red',
    renamed: 'cyan',
    copied: 'blue',
  };
  return colors[status];
}

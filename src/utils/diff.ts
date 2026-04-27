// Diff utility for showing file changes

export interface DiffLine {
  type: 'add' | 'remove' | 'context';
  content: string;
  oldLineNum?: number;
  newLineNum?: number;
}

export interface DiffHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: DiffLine[];
}

export interface FileDiff {
  oldFile: string;
  newFile: string;
  hunks: DiffHunk[];
  additions: number;
  deletions: number;
}

// Simple line-by-line diff using LCS (Longest Common Subsequence)
export function computeDiff(oldText: string, newText: string, contextLines = 3): FileDiff {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');

  // Compute LCS table
  const lcs = computeLCS(oldLines, newLines);

  // Generate diff from LCS
  const rawDiff = generateRawDiff(oldLines, newLines, lcs);

  // Group into hunks with context
  const hunks = groupIntoHunks(rawDiff, oldLines, newLines, contextLines);

  // Count additions and deletions
  let additions = 0;
  let deletions = 0;
  for (const hunk of hunks) {
    for (const line of hunk.lines) {
      if (line.type === 'add') additions++;
      else if (line.type === 'remove') deletions++;
    }
  }

  return {
    oldFile: '',
    newFile: '',
    hunks,
    additions,
    deletions,
  };
}

function computeLCS(a: string[], b: string[]): number[][] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  return dp;
}

interface RawDiffLine {
  type: 'add' | 'remove' | 'same';
  oldIdx?: number;
  newIdx?: number;
  content: string;
}

function generateRawDiff(oldLines: string[], newLines: string[], lcs: number[][]): RawDiffLine[] {
  const diff: RawDiffLine[] = [];
  let i = oldLines.length;
  let j = newLines.length;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      diff.unshift({
        type: 'same',
        oldIdx: i - 1,
        newIdx: j - 1,
        content: oldLines[i - 1],
      });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || lcs[i][j - 1] >= lcs[i - 1][j])) {
      diff.unshift({
        type: 'add',
        newIdx: j - 1,
        content: newLines[j - 1],
      });
      j--;
    } else if (i > 0) {
      diff.unshift({
        type: 'remove',
        oldIdx: i - 1,
        content: oldLines[i - 1],
      });
      i--;
    }
  }

  return diff;
}

function groupIntoHunks(
  rawDiff: RawDiffLine[],
  oldLines: string[],
  newLines: string[],
  contextLines: number
): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  let currentHunk: DiffHunk | null = null;
  let lastChangeIdx = -Infinity;

  for (let idx = 0; idx < rawDiff.length; idx++) {
    const line = rawDiff[idx];

    if (line.type !== 'same') {
      // Start new hunk if needed
      if (!currentHunk || idx - lastChangeIdx > contextLines * 2) {
        if (currentHunk) {
          hunks.push(currentHunk);
        }

        // Calculate hunk start with context
        const contextStart = Math.max(0, idx - contextLines);
        const oldStart = rawDiff[contextStart]?.oldIdx ?? 0;
        const newStart = rawDiff[contextStart]?.newIdx ?? 0;

        currentHunk = {
          oldStart: oldStart + 1, // 1-indexed
          oldCount: 0,
          newStart: newStart + 1,
          newCount: 0,
          lines: [],
        };

        // Add leading context
        for (let c = contextStart; c < idx; c++) {
          const ctxLine = rawDiff[c];
          if (ctxLine.type === 'same') {
            currentHunk.lines.push({
              type: 'context',
              content: ctxLine.content,
              oldLineNum: (ctxLine.oldIdx ?? 0) + 1,
              newLineNum: (ctxLine.newIdx ?? 0) + 1,
            });
            currentHunk.oldCount++;
            currentHunk.newCount++;
          }
        }
      }

      lastChangeIdx = idx;
    }

    if (currentHunk) {
      if (line.type === 'same') {
        // Check if we should include this as trailing context
        if (idx - lastChangeIdx <= contextLines) {
          currentHunk.lines.push({
            type: 'context',
            content: line.content,
            oldLineNum: (line.oldIdx ?? 0) + 1,
            newLineNum: (line.newIdx ?? 0) + 1,
          });
          currentHunk.oldCount++;
          currentHunk.newCount++;
        }
      } else if (line.type === 'add') {
        currentHunk.lines.push({
          type: 'add',
          content: line.content,
          newLineNum: (line.newIdx ?? 0) + 1,
        });
        currentHunk.newCount++;
      } else if (line.type === 'remove') {
        currentHunk.lines.push({
          type: 'remove',
          content: line.content,
          oldLineNum: (line.oldIdx ?? 0) + 1,
        });
        currentHunk.oldCount++;
      }
    }
  }

  if (currentHunk && currentHunk.lines.length > 0) {
    hunks.push(currentHunk);
  }

  return hunks;
}

// Format diff for display
export function formatDiffForDisplay(diff: FileDiff): string {
  const lines: string[] = [];

  for (const hunk of diff.hunks) {
    lines.push(`@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@`);

    for (const line of hunk.lines) {
      const prefix = line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' ';
      lines.push(`${prefix}${line.content}`);
    }
  }

  return lines.join('\n');
}

// Quick diff for simple search/replace operations
export function quickDiff(oldStr: string, newStr: string, filePath: string): string {
  const diff = computeDiff(oldStr, newStr);

  if (diff.hunks.length === 0) {
    return 'No changes';
  }

  const header = `--- a/${filePath}\n+++ b/${filePath}`;
  return `${header}\n${formatDiffForDisplay(diff)}`;
}

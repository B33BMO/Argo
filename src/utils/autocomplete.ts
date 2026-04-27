// Autocomplete utilities for file paths and commands
import * as fs from 'fs/promises';
import * as path from 'path';

export interface CompletionItem {
  value: string;
  display: string;
  type: 'file' | 'directory' | 'command' | 'option';
  description?: string;
}

// File path completion
export async function completeFilePath(
  partial: string,
  cwd: string = process.cwd()
): Promise<CompletionItem[]> {
  try {
    // Expand ~ to home directory
    const expandedPath = partial.startsWith('~')
      ? path.join(process.env.HOME || '', partial.slice(1))
      : partial;

    // Determine the directory to search and the prefix to match
    const isAbsolute = path.isAbsolute(expandedPath);
    const searchDir = isAbsolute
      ? path.dirname(expandedPath)
      : path.dirname(path.join(cwd, expandedPath));

    const prefix = path.basename(expandedPath);
    const dirToSearch = prefix ? searchDir : (isAbsolute ? expandedPath : path.join(cwd, expandedPath));

    // Read directory contents
    const entries = await fs.readdir(dirToSearch, { withFileTypes: true });

    // Filter and map to completion items
    const completions: CompletionItem[] = [];

    for (const entry of entries) {
      const name = entry.name;

      // Skip hidden files unless user started typing a dot
      if (name.startsWith('.') && !prefix.startsWith('.')) {
        continue;
      }

      // Match prefix (case-insensitive)
      if (prefix && !name.toLowerCase().startsWith(prefix.toLowerCase())) {
        continue;
      }

      const fullPath = path.join(dirToSearch, name);
      const relativePath = isAbsolute ? fullPath : path.relative(cwd, fullPath);

      completions.push({
        value: entry.isDirectory() ? relativePath + '/' : relativePath,
        display: name + (entry.isDirectory() ? '/' : ''),
        type: entry.isDirectory() ? 'directory' : 'file',
      });
    }

    // Sort: directories first, then alphabetically
    completions.sort((a, b) => {
      if (a.type === 'directory' && b.type !== 'directory') return -1;
      if (a.type !== 'directory' && b.type === 'directory') return 1;
      return a.display.localeCompare(b.display);
    });

    return completions.slice(0, 20); // Limit results
  } catch {
    return [];
  }
}

// Command completion (slash commands)
export interface Command {
  name: string;
  description: string;
  aliases?: string[];
  args?: string;
}

const BUILTIN_COMMANDS: Command[] = [
  { name: 'help', description: 'Show available commands', aliases: ['h', '?'] },
  { name: 'clear', description: 'Clear conversation history', aliases: ['cls'] },
  { name: 'exit', description: 'Exit Argo', aliases: ['quit', 'q'] },
  { name: 'model', description: 'Switch model', args: '<model-name>' },
  { name: 'session', description: 'Session management', args: '[list|new|load|save|delete]' },
  { name: 'providers', description: 'Manage LLM providers (add, switch, edit)', aliases: ['provider'] },
  { name: 'export', description: 'Export conversation', args: '[markdown|html|json]' },
  { name: 'theme', description: 'Change color theme', args: '<theme-name>' },
  { name: 'icons', description: 'Change icon style', args: '[nerd|unicode|ascii]' },
  { name: 'history', description: 'Search conversation history', args: '[query]' },
  { name: 'undo', description: 'Undo last message' },
  { name: 'retry', description: 'Retry last request' },
  { name: 'copy', description: 'Copy last response to clipboard' },
  { name: 'compact', description: 'Toggle compact mode' },
  { name: 'tokens', description: 'Show token usage' },
];

export function completeCommand(partial: string): CompletionItem[] {
  const query = partial.toLowerCase().replace(/^\//, '');

  return BUILTIN_COMMANDS
    .filter(cmd => {
      const matchesName = cmd.name.toLowerCase().startsWith(query);
      const matchesAlias = cmd.aliases?.some(a => a.toLowerCase().startsWith(query));
      return matchesName || matchesAlias;
    })
    .map(cmd => ({
      value: '/' + cmd.name + (cmd.args ? ' ' : ''),
      display: '/' + cmd.name,
      type: 'command' as const,
      description: cmd.description,
    }));
}

// Fuzzy matching for command palette
export function fuzzyMatch(query: string, text: string): { match: boolean; score: number } {
  const q = query.toLowerCase();
  const t = text.toLowerCase();

  // Exact prefix match is best
  if (t.startsWith(q)) {
    return { match: true, score: 100 - t.length + q.length };
  }

  // Substring match
  if (t.includes(q)) {
    return { match: true, score: 50 };
  }

  // Fuzzy character match
  let qIdx = 0;
  let score = 0;
  let lastMatchIdx = -1;

  for (let tIdx = 0; tIdx < t.length && qIdx < q.length; tIdx++) {
    if (t[tIdx] === q[qIdx]) {
      // Consecutive matches score higher
      if (lastMatchIdx === tIdx - 1) {
        score += 10;
      } else {
        score += 5;
      }
      lastMatchIdx = tIdx;
      qIdx++;
    }
  }

  if (qIdx === q.length) {
    return { match: true, score };
  }

  return { match: false, score: 0 };
}

// Search commands with fuzzy matching
export function searchCommands(query: string): CompletionItem[] {
  if (!query) {
    return BUILTIN_COMMANDS.map(cmd => ({
      value: '/' + cmd.name,
      display: '/' + cmd.name,
      type: 'command' as const,
      description: cmd.description,
    }));
  }

  const results: { item: CompletionItem; score: number }[] = [];

  for (const cmd of BUILTIN_COMMANDS) {
    const nameMatch = fuzzyMatch(query, cmd.name);
    const descMatch = fuzzyMatch(query, cmd.description);
    const aliasMatches = cmd.aliases?.map(a => fuzzyMatch(query, a)) || [];

    const bestScore = Math.max(
      nameMatch.score * 2, // Name matches are weighted higher
      descMatch.score,
      ...aliasMatches.map(m => m.score * 1.5)
    );

    if (nameMatch.match || descMatch.match || aliasMatches.some(m => m.match)) {
      results.push({
        item: {
          value: '/' + cmd.name,
          display: '/' + cmd.name,
          type: 'command',
          description: cmd.description,
        },
        score: bestScore,
      });
    }
  }

  return results
    .sort((a, b) => b.score - a.score)
    .map(r => r.item);
}

// Get completion based on context
export async function getCompletions(
  input: string,
  cursorPosition: number,
  cwd: string
): Promise<CompletionItem[]> {
  const beforeCursor = input.slice(0, cursorPosition);

  // Command completion
  if (beforeCursor.startsWith('/')) {
    return completeCommand(beforeCursor);
  }

  // File path completion - look for path-like patterns
  const pathMatch = beforeCursor.match(/(?:^|\s)((?:~|\.{0,2})?\/[^\s]*|[^\s]+\/)$/);
  if (pathMatch) {
    return completeFilePath(pathMatch[1], cwd);
  }

  // Check for common file-related keywords
  const fileKeywords = ['read', 'open', 'edit', 'cat', 'write', 'save', 'file', 'load'];
  const lastWord = beforeCursor.split(/\s+/).pop() || '';

  for (const keyword of fileKeywords) {
    if (beforeCursor.toLowerCase().includes(keyword + ' ')) {
      // User mentioned a file keyword, try to complete the path
      if (lastWord) {
        return completeFilePath(lastWord, cwd);
      }
    }
  }

  return [];
}

export { BUILTIN_COMMANDS };

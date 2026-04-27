// Syntax highlighting for terminal output
// Simple regex-based highlighter optimized for TUI display

export type Language =
  | 'javascript'
  | 'typescript'
  | 'python'
  | 'rust'
  | 'go'
  | 'json'
  | 'yaml'
  | 'bash'
  | 'sql'
  | 'html'
  | 'css'
  | 'markdown'
  | 'diff'
  | 'plain';

interface Token {
  type: 'keyword' | 'string' | 'number' | 'comment' | 'function' | 'operator' | 'type' | 'variable' | 'plain';
  value: string;
}

// ANSI color codes for terminal
const COLORS = {
  keyword: '\x1b[35m',     // Magenta
  string: '\x1b[32m',      // Green
  number: '\x1b[33m',      // Yellow
  comment: '\x1b[90m',     // Gray
  function: '\x1b[36m',    // Cyan
  operator: '\x1b[37m',    // White
  type: '\x1b[34m',        // Blue
  variable: '\x1b[33m',    // Yellow
  plain: '\x1b[0m',        // Reset
  reset: '\x1b[0m',
};

// Language-specific keywords
const KEYWORDS: Record<string, string[]> = {
  javascript: [
    'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while',
    'class', 'extends', 'import', 'export', 'from', 'default', 'async', 'await',
    'try', 'catch', 'throw', 'new', 'this', 'super', 'typeof', 'instanceof',
    'true', 'false', 'null', 'undefined', 'switch', 'case', 'break', 'continue',
  ],
  typescript: [
    'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while',
    'class', 'extends', 'import', 'export', 'from', 'default', 'async', 'await',
    'try', 'catch', 'throw', 'new', 'this', 'super', 'typeof', 'instanceof',
    'true', 'false', 'null', 'undefined', 'interface', 'type', 'enum', 'as',
    'implements', 'private', 'public', 'protected', 'readonly', 'static',
    'switch', 'case', 'break', 'continue',
  ],
  python: [
    'def', 'class', 'return', 'if', 'elif', 'else', 'for', 'while', 'import',
    'from', 'as', 'try', 'except', 'finally', 'raise', 'with', 'lambda',
    'True', 'False', 'None', 'and', 'or', 'not', 'in', 'is', 'pass', 'break',
    'continue', 'yield', 'async', 'await', 'global', 'nonlocal',
  ],
  rust: [
    'fn', 'let', 'mut', 'const', 'struct', 'enum', 'impl', 'trait', 'pub',
    'use', 'mod', 'crate', 'self', 'super', 'if', 'else', 'match', 'for',
    'while', 'loop', 'return', 'break', 'continue', 'async', 'await', 'move',
    'true', 'false', 'Some', 'None', 'Ok', 'Err', 'where', 'type', 'dyn',
  ],
  go: [
    'func', 'var', 'const', 'type', 'struct', 'interface', 'package', 'import',
    'if', 'else', 'for', 'range', 'switch', 'case', 'default', 'return',
    'break', 'continue', 'go', 'defer', 'select', 'chan', 'map', 'make', 'new',
    'true', 'false', 'nil', 'error',
  ],
  bash: [
    'if', 'then', 'else', 'elif', 'fi', 'for', 'while', 'do', 'done', 'case',
    'esac', 'function', 'return', 'exit', 'export', 'local', 'readonly',
    'echo', 'printf', 'read', 'cd', 'pwd', 'ls', 'rm', 'mv', 'cp', 'mkdir',
    'cat', 'grep', 'sed', 'awk', 'find', 'xargs', 'true', 'false',
  ],
  sql: [
    'SELECT', 'FROM', 'WHERE', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP',
    'TABLE', 'INDEX', 'VIEW', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'ON',
    'AND', 'OR', 'NOT', 'NULL', 'IS', 'IN', 'LIKE', 'ORDER', 'BY', 'GROUP',
    'HAVING', 'LIMIT', 'OFFSET', 'AS', 'DISTINCT', 'COUNT', 'SUM', 'AVG',
    'MAX', 'MIN', 'TRUE', 'FALSE', 'VALUES', 'SET', 'ALTER', 'ADD', 'COLUMN',
  ],
};

const TYPES: Record<string, string[]> = {
  typescript: ['string', 'number', 'boolean', 'void', 'any', 'unknown', 'never', 'object', 'Array', 'Promise', 'Record', 'Partial', 'Required', 'Readonly'],
  rust: ['i8', 'i16', 'i32', 'i64', 'u8', 'u16', 'u32', 'u64', 'f32', 'f64', 'bool', 'char', 'str', 'String', 'Vec', 'Option', 'Result', 'Box', 'Rc', 'Arc'],
  go: ['int', 'int8', 'int16', 'int32', 'int64', 'uint', 'uint8', 'uint16', 'uint32', 'uint64', 'float32', 'float64', 'bool', 'string', 'byte', 'rune'],
};

// Detect language from file extension or content
export function detectLanguage(content: string, filename?: string): Language {
  if (filename) {
    const ext = filename.split('.').pop()?.toLowerCase();
    const extMap: Record<string, Language> = {
      js: 'javascript',
      jsx: 'javascript',
      ts: 'typescript',
      tsx: 'typescript',
      py: 'python',
      rs: 'rust',
      go: 'go',
      json: 'json',
      yaml: 'yaml',
      yml: 'yaml',
      sh: 'bash',
      bash: 'bash',
      zsh: 'bash',
      sql: 'sql',
      html: 'html',
      htm: 'html',
      css: 'css',
      md: 'markdown',
      diff: 'diff',
      patch: 'diff',
    };
    if (ext && extMap[ext]) return extMap[ext];
  }

  // Content-based detection
  if (content.startsWith('{') || content.startsWith('[')) return 'json';
  if (content.includes('#!/bin/bash') || content.includes('#!/bin/sh')) return 'bash';
  if (/^(---|\w+:)/m.test(content)) return 'yaml';
  if (/^(\+\+\+|---|\@\@)/m.test(content)) return 'diff';
  if (/^(import|from)\s+\w+/m.test(content) && /def\s+\w+/m.test(content)) return 'python';
  if (/^(import|const|let|var|function)/m.test(content)) return 'javascript';
  if (/^(fn|struct|impl|use)\s+/m.test(content)) return 'rust';
  if (/^(package|func|import)\s+/m.test(content)) return 'go';
  if (/^(SELECT|INSERT|UPDATE|DELETE|CREATE)/im.test(content)) return 'sql';

  return 'plain';
}

// Simple tokenizer
function tokenize(code: string, language: Language): Token[] {
  const tokens: Token[] = [];
  const keywords = KEYWORDS[language] || [];
  const types = TYPES[language] || [];

  // Patterns (order matters - more specific first)
  const patterns: [RegExp, Token['type']][] = [
    // Comments
    [/^\/\/.*$/m, 'comment'],
    [/^#.*$/m, 'comment'],
    [/^--.*$/m, 'comment'],
    [/^\/\*[\s\S]*?\*\//m, 'comment'],

    // Strings
    [/^"(?:[^"\\]|\\.)*"/, 'string'],
    [/^'(?:[^'\\]|\\.)*'/, 'string'],
    [/^`(?:[^`\\]|\\.)*`/, 'string'],
    [/^"""[\s\S]*?"""/, 'string'],
    [/^'''[\s\S]*?'''/, 'string'],

    // Numbers
    [/^0x[0-9a-fA-F]+/, 'number'],
    [/^0b[01]+/, 'number'],
    [/^\d+\.?\d*(?:e[+-]?\d+)?/, 'number'],

    // Operators
    [/^[+\-*/%=<>!&|^~?:;,.()\[\]{}]+/, 'operator'],

    // Words (keywords, types, identifiers)
    [/^[a-zA-Z_][a-zA-Z0-9_]*/, 'plain'],

    // Whitespace and other
    [/^\s+/, 'plain'],
    [/^./, 'plain'],
  ];

  let remaining = code;

  while (remaining.length > 0) {
    let matched = false;

    for (const [pattern, tokenType] of patterns) {
      const match = remaining.match(pattern);
      if (match) {
        let type = tokenType;
        const value = match[0];

        // Check if word is a keyword or type
        if (tokenType === 'plain' && /^[a-zA-Z_]/.test(value)) {
          if (keywords.includes(value) || keywords.includes(value.toUpperCase())) {
            type = 'keyword';
          } else if (types.includes(value)) {
            type = 'type';
          } else if (/^[A-Z]/.test(value)) {
            type = 'type'; // PascalCase is usually a type/class
          } else if (remaining.slice(value.length).trimStart().startsWith('(')) {
            type = 'function'; // Followed by ( is likely a function
          }
        }

        tokens.push({ type, value });
        remaining = remaining.slice(value.length);
        matched = true;
        break;
      }
    }

    if (!matched) {
      tokens.push({ type: 'plain', value: remaining[0] });
      remaining = remaining.slice(1);
    }
  }

  return tokens;
}

// Highlight code with ANSI colors
export function highlightCode(code: string, language: Language): string {
  if (language === 'plain') return code;

  const tokens = tokenize(code, language);
  let result = '';

  for (const token of tokens) {
    const color = COLORS[token.type] || COLORS.plain;
    result += color + token.value + COLORS.reset;
  }

  return result;
}

// Highlight for diff output
export function highlightDiff(diff: string): string {
  return diff.split('\n').map(line => {
    if (line.startsWith('+') && !line.startsWith('+++')) {
      return COLORS.string + line + COLORS.reset; // Green for additions
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      return '\x1b[31m' + line + COLORS.reset; // Red for deletions
    } else if (line.startsWith('@@')) {
      return COLORS.type + line + COLORS.reset; // Blue for hunk headers
    } else if (line.startsWith('diff') || line.startsWith('index')) {
      return COLORS.keyword + line + COLORS.reset; // Magenta for file headers
    }
    return line;
  }).join('\n');
}

// Strip ANSI codes (for plain text output)
export function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

// Get color for Ink Text component
export function getTokenColor(type: Token['type']): string {
  const colorMap: Record<Token['type'], string> = {
    keyword: 'magenta',
    string: 'green',
    number: 'yellow',
    comment: 'gray',
    function: 'cyan',
    operator: 'white',
    type: 'blue',
    variable: 'yellow',
    plain: 'white',
  };
  return colorMap[type];
}

import React from 'react';
import { Box, Text } from 'ink';

interface MarkdownProps {
  children: string;
}

// Simple syntax highlighter for code
function highlightCode(code: string, language?: string): React.ReactNode[] {
  // Keywords for common languages
  const keywords = [
    'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while',
    'class', 'import', 'export', 'from', 'async', 'await', 'try', 'catch',
    'throw', 'new', 'this', 'true', 'false', 'null', 'undefined', 'typeof',
    'interface', 'type', 'extends', 'implements', 'public', 'private', 'static',
    'def', 'self', 'None', 'True', 'False', 'elif', 'except', 'finally',
    'fn', 'pub', 'mut', 'impl', 'struct', 'enum', 'match', 'use', 'mod',
  ];

  const lines = code.split('\n');

  return lines.map((line, lineIdx) => {
    const parts: React.ReactNode[] = [];
    let remaining = line;
    let partKey = 0;

    // Process the line
    while (remaining.length > 0) {
      // Check for strings
      const stringMatch = remaining.match(/^(["'`]).*?\1/);
      if (stringMatch) {
        parts.push(
          <Text key={partKey++} color="yellow">
            {stringMatch[0]}
          </Text>
        );
        remaining = remaining.slice(stringMatch[0].length);
        continue;
      }

      // Check for comments
      const commentMatch = remaining.match(/^(\/\/.*|#.*|\/\*[\s\S]*?\*\/)/);
      if (commentMatch) {
        parts.push(
          <Text key={partKey++} color="gray" dimColor>
            {commentMatch[0]}
          </Text>
        );
        remaining = remaining.slice(commentMatch[0].length);
        continue;
      }

      // Check for numbers
      const numberMatch = remaining.match(/^(\d+\.?\d*)/);
      if (numberMatch) {
        parts.push(
          <Text key={partKey++} color="magenta">
            {numberMatch[0]}
          </Text>
        );
        remaining = remaining.slice(numberMatch[0].length);
        continue;
      }

      // Check for keywords
      const wordMatch = remaining.match(/^([a-zA-Z_]\w*)/);
      if (wordMatch) {
        const word = wordMatch[0];
        if (keywords.includes(word)) {
          parts.push(
            <Text key={partKey++} color="blue" bold>
              {word}
            </Text>
          );
        } else if (word[0] === word[0].toUpperCase() && word.length > 1) {
          // Likely a class/type name
          parts.push(
            <Text key={partKey++} color="cyan">
              {word}
            </Text>
          );
        } else {
          parts.push(<Text key={partKey++}>{word}</Text>);
        }
        remaining = remaining.slice(word.length);
        continue;
      }

      // Operators and punctuation
      const opMatch = remaining.match(/^([{}()\[\];:,.<>+\-*/%=!&|^~?@])/);
      if (opMatch) {
        parts.push(
          <Text key={partKey++} color="white">
            {opMatch[0]}
          </Text>
        );
        remaining = remaining.slice(1);
        continue;
      }

      // Default: just add the character
      parts.push(<Text key={partKey++}>{remaining[0]}</Text>);
      remaining = remaining.slice(1);
    }

    return (
      <Box key={lineIdx}>
        <Text color="gray" dimColor>
          {String(lineIdx + 1).padStart(3, ' ')} │{' '}
        </Text>
        {parts}
      </Box>
    );
  });
}

// Parse and render markdown
export function Markdown({ children }: MarkdownProps) {
  const lines = children.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code blocks
    if (line.startsWith('```')) {
      const language = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // Skip closing ```

      elements.push(
        <Box
          key={key++}
          flexDirection="column"
          borderStyle="round"
          borderColor="gray"
          paddingX={1}
          marginY={1}
        >
          {language && (
            <Box marginBottom={1}>
              <Text color="gray" dimColor>
                {language}
              </Text>
            </Box>
          )}
          <Box flexDirection="column">
            {highlightCode(codeLines.join('\n'), language)}
          </Box>
        </Box>
      );
      continue;
    }

    // Headers
    const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headerMatch) {
      const level = headerMatch[1].length;
      const text = headerMatch[2];
      const colors = ['green', 'cyan', 'blue', 'magenta', 'yellow', 'white'] as const;
      elements.push(
        <Box key={key++} marginY={level === 1 ? 1 : 0}>
          <Text bold color={colors[level - 1]}>
            {level === 1 ? '═══ ' : level === 2 ? '── ' : ''}
            {text}
            {level === 1 ? ' ═══' : ''}
          </Text>
        </Box>
      );
      i++;
      continue;
    }

    // Blockquotes
    if (line.startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].startsWith('>')) {
        quoteLines.push(lines[i].slice(1).trim());
        i++;
      }
      elements.push(
        <Box key={key++} marginY={1} paddingLeft={1} borderStyle="single" borderLeft borderColor="yellow">
          <Text color="yellow" italic>
            {quoteLines.join('\n')}
          </Text>
        </Box>
      );
      continue;
    }

    // Unordered lists
    if (line.match(/^[\s]*[-*+]\s/)) {
      const listItems: string[] = [];
      while (i < lines.length && lines[i].match(/^[\s]*[-*+]\s/)) {
        listItems.push(lines[i].replace(/^[\s]*[-*+]\s/, ''));
        i++;
      }
      elements.push(
        <Box key={key++} flexDirection="column" marginLeft={1}>
          {listItems.map((item, idx) => (
            <Box key={idx}>
              <Text color="cyan">● </Text>
              <Text>{renderInlineMarkdown(item)}</Text>
            </Box>
          ))}
        </Box>
      );
      continue;
    }

    // Ordered lists
    if (line.match(/^[\s]*\d+\.\s/)) {
      const listItems: string[] = [];
      let num = 1;
      while (i < lines.length && lines[i].match(/^[\s]*\d+\.\s/)) {
        listItems.push(lines[i].replace(/^[\s]*\d+\.\s/, ''));
        i++;
      }
      elements.push(
        <Box key={key++} flexDirection="column" marginLeft={1}>
          {listItems.map((item, idx) => (
            <Box key={idx}>
              <Text color="cyan">{idx + 1}. </Text>
              <Text>{renderInlineMarkdown(item)}</Text>
            </Box>
          ))}
        </Box>
      );
      continue;
    }

    // Horizontal rule
    if (line.match(/^[-*_]{3,}$/)) {
      elements.push(
        <Box key={key++} marginY={1}>
          <Text color="gray">{'─'.repeat(50)}</Text>
        </Box>
      );
      i++;
      continue;
    }

    // Empty line
    if (line.trim() === '') {
      elements.push(<Box key={key++} height={1} />);
      i++;
      continue;
    }

    // Regular paragraph
    elements.push(
      <Box key={key++}>
        <Text wrap="wrap">{renderInlineMarkdown(line)}</Text>
      </Box>
    );
    i++;
  }

  return <Box flexDirection="column">{elements}</Box>;
}

// Render inline markdown (bold, italic, code, links)
function renderInlineMarkdown(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    // Bold + italic
    const boldItalicMatch = remaining.match(/^\*\*\*(.+?)\*\*\*/);
    if (boldItalicMatch) {
      parts.push(
        <Text key={key++} bold italic color="white">
          {boldItalicMatch[1]}
        </Text>
      );
      remaining = remaining.slice(boldItalicMatch[0].length);
      continue;
    }

    // Bold
    const boldMatch = remaining.match(/^\*\*(.+?)\*\*/);
    if (boldMatch) {
      parts.push(
        <Text key={key++} bold>
          {boldMatch[1]}
        </Text>
      );
      remaining = remaining.slice(boldMatch[0].length);
      continue;
    }

    // Italic
    const italicMatch = remaining.match(/^\*(.+?)\*/);
    if (italicMatch) {
      parts.push(
        <Text key={key++} italic>
          {italicMatch[1]}
        </Text>
      );
      remaining = remaining.slice(italicMatch[0].length);
      continue;
    }

    // Strikethrough
    const strikeMatch = remaining.match(/^~~(.+?)~~/);
    if (strikeMatch) {
      parts.push(
        <Text key={key++} strikethrough color="gray">
          {strikeMatch[1]}
        </Text>
      );
      remaining = remaining.slice(strikeMatch[0].length);
      continue;
    }

    // Inline code
    const codeMatch = remaining.match(/^`([^`]+)`/);
    if (codeMatch) {
      parts.push(
        <Text key={key++} backgroundColor="gray" color="white">
          {' '}{codeMatch[1]}{' '}
        </Text>
      );
      remaining = remaining.slice(codeMatch[0].length);
      continue;
    }

    // Links [text](url)
    const linkMatch = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/);
    if (linkMatch) {
      parts.push(
        <Text key={key++} color="blue" underline>
          {linkMatch[1]}
        </Text>
      );
      remaining = remaining.slice(linkMatch[0].length);
      continue;
    }

    // Regular text - take until next special character
    const normalMatch = remaining.match(/^[^*`~\[]+/);
    if (normalMatch) {
      parts.push(<Text key={key++}>{normalMatch[0]}</Text>);
      remaining = remaining.slice(normalMatch[0].length);
      continue;
    }

    // Fallback: just take the next character
    parts.push(<Text key={key++}>{remaining[0]}</Text>);
    remaining = remaining.slice(1);
  }

  return parts;
}

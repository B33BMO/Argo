// Export conversations to various formats
import * as fs from 'fs/promises';
import * as path from 'path';
import type { Message } from '../providers/types.js';

export interface ExportOptions {
  format: 'markdown' | 'html' | 'json' | 'text';
  includeSystemPrompt?: boolean;
  includeToolCalls?: boolean;
  includeTimestamps?: boolean;
  title?: string;
}

export interface ExportResult {
  content: string;
  filename: string;
  mimeType: string;
}

// Export to Markdown
function exportToMarkdown(
  messages: Message[],
  options: ExportOptions
): string {
  const lines: string[] = [];

  // Title
  if (options.title) {
    lines.push(`# ${options.title}`);
    lines.push('');
  }

  // Date
  lines.push(`*Exported: ${new Date().toLocaleString()}*`);
  lines.push('');
  lines.push('---');
  lines.push('');

  for (const msg of messages) {
    // Skip system prompts if not included
    if (msg.role === 'system' && !options.includeSystemPrompt) {
      continue;
    }

    // Skip tool results if not included
    if (msg.role === 'tool' && !options.includeToolCalls) {
      continue;
    }

    // Role header
    const roleLabels: Record<string, string> = {
      user: '## 👤 User',
      assistant: '## 🤖 Assistant',
      system: '## ⚙️ System',
      tool: '## 🔧 Tool Result',
    };

    lines.push(roleLabels[msg.role] || `## ${msg.role}`);
    lines.push('');

    // Content
    lines.push(msg.content);
    lines.push('');

    // Tool calls
    if (options.includeToolCalls && msg.toolCalls && msg.toolCalls.length > 0) {
      lines.push('**Tool Calls:**');
      for (const tc of msg.toolCalls) {
        lines.push(`- \`${tc.name}\`: \`${JSON.stringify(tc.arguments)}\``);
      }
      lines.push('');
    }

    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}

// Export to HTML
function exportToHtml(
  messages: Message[],
  options: ExportOptions
): string {
  const roleColors: Record<string, string> = {
    user: '#3498db',
    assistant: '#2ecc71',
    system: '#f39c12',
    tool: '#9b59b6',
  };

  const messageHtml = messages
    .filter(msg => {
      if (msg.role === 'system' && !options.includeSystemPrompt) return false;
      if (msg.role === 'tool' && !options.includeToolCalls) return false;
      return true;
    })
    .map(msg => {
      const color = roleColors[msg.role] || '#333';
      const roleLabel = msg.role.charAt(0).toUpperCase() + msg.role.slice(1);

      // Escape HTML
      const escapedContent = msg.content
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>');

      return `
        <div class="message ${msg.role}" style="border-left: 4px solid ${color}; padding: 12px; margin: 12px 0; background: #f9f9f9;">
          <div class="role" style="font-weight: bold; color: ${color}; margin-bottom: 8px;">
            ${roleLabel}
          </div>
          <div class="content" style="white-space: pre-wrap;">
            ${escapedContent}
          </div>
        </div>
      `;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${options.title || 'Roo Conversation'}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
      background: #fff;
      color: #333;
    }
    h1 { color: #2c3e50; }
    .meta { color: #7f8c8d; font-size: 14px; margin-bottom: 20px; }
    code {
      background: #f4f4f4;
      padding: 2px 6px;
      border-radius: 3px;
      font-family: 'Monaco', 'Consolas', monospace;
    }
    pre {
      background: #2d2d2d;
      color: #f8f8f2;
      padding: 16px;
      border-radius: 6px;
      overflow-x: auto;
    }
  </style>
</head>
<body>
  <h1>${options.title || 'Roo Conversation'}</h1>
  <div class="meta">Exported: ${new Date().toLocaleString()}</div>
  ${messageHtml}
</body>
</html>`;
}

// Export to JSON
function exportToJson(
  messages: Message[],
  options: ExportOptions
): string {
  const filtered = messages.filter(msg => {
    if (msg.role === 'system' && !options.includeSystemPrompt) return false;
    if (msg.role === 'tool' && !options.includeToolCalls) return false;
    return true;
  });

  const data = {
    title: options.title,
    exportedAt: new Date().toISOString(),
    messageCount: filtered.length,
    messages: filtered,
  };

  return JSON.stringify(data, null, 2);
}

// Export to plain text
function exportToText(
  messages: Message[],
  options: ExportOptions
): string {
  const lines: string[] = [];

  if (options.title) {
    lines.push(options.title);
    lines.push('='.repeat(options.title.length));
    lines.push('');
  }

  lines.push(`Exported: ${new Date().toLocaleString()}`);
  lines.push('');
  lines.push('-'.repeat(50));
  lines.push('');

  for (const msg of messages) {
    if (msg.role === 'system' && !options.includeSystemPrompt) continue;
    if (msg.role === 'tool' && !options.includeToolCalls) continue;

    const roleLabel = msg.role.toUpperCase();
    lines.push(`[${roleLabel}]`);
    lines.push(msg.content);
    lines.push('');
    lines.push('-'.repeat(50));
    lines.push('');
  }

  return lines.join('\n');
}

// Main export function
export function exportConversation(
  messages: Message[],
  options: ExportOptions
): ExportResult {
  let content: string;
  let extension: string;
  let mimeType: string;

  switch (options.format) {
    case 'markdown':
      content = exportToMarkdown(messages, options);
      extension = 'md';
      mimeType = 'text/markdown';
      break;
    case 'html':
      content = exportToHtml(messages, options);
      extension = 'html';
      mimeType = 'text/html';
      break;
    case 'json':
      content = exportToJson(messages, options);
      extension = 'json';
      mimeType = 'application/json';
      break;
    case 'text':
    default:
      content = exportToText(messages, options);
      extension = 'txt';
      mimeType = 'text/plain';
      break;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `roo-export-${timestamp}.${extension}`;

  return { content, filename, mimeType };
}

// Save export to file
export async function saveExport(
  result: ExportResult,
  directory: string = process.cwd()
): Promise<string> {
  const filePath = path.join(directory, result.filename);
  await fs.writeFile(filePath, result.content, 'utf-8');
  return filePath;
}

// Quick export helpers
export async function exportAsMarkdown(
  messages: Message[],
  directory?: string,
  title?: string
): Promise<string> {
  const result = exportConversation(messages, {
    format: 'markdown',
    includeSystemPrompt: false,
    includeToolCalls: true,
    title,
  });
  return saveExport(result, directory);
}

export async function exportAsJson(
  messages: Message[],
  directory?: string
): Promise<string> {
  const result = exportConversation(messages, {
    format: 'json',
    includeSystemPrompt: true,
    includeToolCalls: true,
  });
  return saveExport(result, directory);
}

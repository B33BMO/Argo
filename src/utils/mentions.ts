// @mention syntax — type @path/to/file in a message and the file contents get attached.
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { isSensitivePath, redactSecrets } from './secrets.js';

const MAX_FILE_SIZE = 200_000; // 200KB per file
const MAX_TOTAL_SIZE = 500_000; // 500KB total across all mentions

export interface AttachedFile {
  path: string;
  absolutePath: string;
  content: string;
  bytes: number;
  truncated: boolean;
}

export interface ExpandedMessage {
  content: string;        // The user's message (mentions removed/replaced inline)
  attachments: AttachedFile[];
  errors: string[];
}

/**
 * Match @<path> patterns. The path may contain alphanumerics, /, -, _, ., ~
 * Stops at whitespace or punctuation that wouldn't be in a path.
 * Won't match emails (must not have @ inside the path).
 */
const MENTION_RE = /(?:^|\s)@([~./][^\s]*|[a-zA-Z0-9_./-][a-zA-Z0-9_./-]*)/g;

/**
 * Resolve a mention path: ~ expansion, relative-to-cwd resolution, and
 * absolute path normalization.
 */
function resolveMentionPath(rawPath: string, cwd: string): string {
  if (rawPath.startsWith('~')) {
    return path.join(os.homedir(), rawPath.slice(1));
  }
  if (path.isAbsolute(rawPath)) {
    return rawPath;
  }
  return path.resolve(cwd, rawPath);
}

/**
 * Detect whether a string looks like it could be a file path. Filters out
 * obvious false positives like @username, @TODO, @everyone.
 */
function looksLikeFilePath(p: string): boolean {
  // Must contain a separator OR have a file extension OR start with ~/.
  return p.includes('/') || /\.\w{1,8}$/.test(p) || p.startsWith('~');
}

export async function expandMentions(message: string, cwd: string): Promise<ExpandedMessage> {
  const attachments: AttachedFile[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  let totalBytes = 0;

  const matches = Array.from(message.matchAll(MENTION_RE));

  for (const match of matches) {
    const rawPath = match[1];
    if (!looksLikeFilePath(rawPath)) continue;

    const absolutePath = resolveMentionPath(rawPath, cwd);
    if (seen.has(absolutePath)) continue;
    seen.add(absolutePath);

    // Hard-block sensitive paths from being attached via @mention.
    // The user can still paste contents manually if they really mean to.
    if (isSensitivePath(absolutePath)) {
      errors.push(`@${rawPath}: blocked — sensitive file (env/credentials/private key). Paste manually if intended.`);
      continue;
    }

    try {
      const stat = await fs.stat(absolutePath);
      if (stat.isDirectory()) {
        errors.push(`@${rawPath}: is a directory (not yet supported)`);
        continue;
      }

      let content = await fs.readFile(absolutePath, 'utf-8');
      // Defense in depth: scrub secret-looking values from the attached body.
      const scrub = redactSecrets(content);
      content = scrub.output;
      if (scrub.redactions > 0) {
        errors.push(`@${rawPath}: auto-redacted ${scrub.redactions} value(s) that looked like secrets`);
      }
      const originalBytes = Buffer.byteLength(content, 'utf-8');
      let truncated = false;

      if (originalBytes > MAX_FILE_SIZE) {
        content = content.slice(0, MAX_FILE_SIZE) + `\n\n[truncated — file is ${originalBytes} bytes]`;
        truncated = true;
      }

      const bytes = Buffer.byteLength(content, 'utf-8');
      if (totalBytes + bytes > MAX_TOTAL_SIZE) {
        errors.push(`@${rawPath}: skipped (would exceed total attachment size)`);
        continue;
      }
      totalBytes += bytes;

      attachments.push({
        path: rawPath,
        absolutePath,
        content,
        bytes,
        truncated,
      });
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      if (e.code === 'ENOENT') {
        // Silently skip — might just be an @ in regular text
        continue;
      }
      errors.push(`@${rawPath}: ${e.message}`);
    }
  }

  // Build the final message: original text + appended file blocks
  let final = message;
  if (attachments.length > 0) {
    const blocks = attachments.map(a =>
      `\n\n--- attached: ${a.path} (${a.bytes} bytes${a.truncated ? ', truncated' : ''}) ---\n${a.content}\n--- end ${a.path} ---`
    ).join('');
    final = message + blocks;
  }

  return { content: final, attachments, errors };
}

export function formatAttachmentSummary(attachments: AttachedFile[]): string {
  if (attachments.length === 0) return '';
  const totalKB = (attachments.reduce((s, a) => s + a.bytes, 0) / 1024).toFixed(1);
  return `attached ${attachments.length} file${attachments.length === 1 ? '' : 's'} · ${totalKB}KB`;
}

// Conversation history management
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type { Message } from '../providers/types.js';

export interface Session {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  messages: Message[];
  metadata?: {
    provider?: string;
    model?: string;
    tokenCount?: number;
  };
}

export interface SessionSummary {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  messageCount: number;
  preview: string; // First user message preview
}

const HISTORY_DIR = path.join(os.homedir(), '.roo', 'history');

async function ensureHistoryDir(): Promise<void> {
  await fs.mkdir(HISTORY_DIR, { recursive: true });
}

function generateId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function getSessionPath(id: string): string {
  return path.join(HISTORY_DIR, `${id}.json`);
}

export async function createSession(name?: string): Promise<Session> {
  await ensureHistoryDir();

  const session: Session = {
    id: generateId(),
    name: name || `Session ${new Date().toLocaleDateString()}`,
    createdAt: new Date(),
    updatedAt: new Date(),
    messages: [],
  };

  await saveSession(session);
  return session;
}

export async function saveSession(session: Session): Promise<void> {
  await ensureHistoryDir();
  session.updatedAt = new Date();

  const data = JSON.stringify(session, null, 2);
  await fs.writeFile(getSessionPath(session.id), data, 'utf-8');
}

export async function loadSession(id: string): Promise<Session | null> {
  try {
    const data = await fs.readFile(getSessionPath(id), 'utf-8');
    const session = JSON.parse(data);
    // Parse dates
    session.createdAt = new Date(session.createdAt);
    session.updatedAt = new Date(session.updatedAt);
    return session;
  } catch {
    return null;
  }
}

export async function deleteSession(id: string): Promise<boolean> {
  try {
    await fs.unlink(getSessionPath(id));
    return true;
  } catch {
    return false;
  }
}

export async function listSessions(): Promise<SessionSummary[]> {
  await ensureHistoryDir();

  try {
    const files = await fs.readdir(HISTORY_DIR);
    const sessions: SessionSummary[] = [];

    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      try {
        const data = await fs.readFile(path.join(HISTORY_DIR, file), 'utf-8');
        const session: Session = JSON.parse(data);

        // Get first user message as preview
        const firstUserMsg = session.messages.find(m => m.role === 'user');
        const preview = firstUserMsg?.content?.slice(0, 100) || 'Empty session';

        sessions.push({
          id: session.id,
          name: session.name,
          createdAt: new Date(session.createdAt),
          updatedAt: new Date(session.updatedAt),
          messageCount: session.messages.length,
          preview: preview.length === 100 ? preview + '...' : preview,
        });
      } catch {
        // Skip invalid files
      }
    }

    // Sort by most recent first
    sessions.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    return sessions;
  } catch {
    return [];
  }
}

export async function searchSessions(query: string): Promise<SessionSummary[]> {
  const sessions = await listSessions();
  const lowerQuery = query.toLowerCase();

  // First, filter by name match
  const nameMatches = sessions.filter(s =>
    s.name.toLowerCase().includes(lowerQuery) ||
    s.preview.toLowerCase().includes(lowerQuery)
  );

  if (nameMatches.length > 0) {
    return nameMatches;
  }

  // Deep search in messages
  const results: SessionSummary[] = [];

  for (const summary of sessions) {
    const session = await loadSession(summary.id);
    if (!session) continue;

    const hasMatch = session.messages.some(m =>
      m.content.toLowerCase().includes(lowerQuery)
    );

    if (hasMatch) {
      results.push(summary);
    }
  }

  return results;
}

export async function renameSession(id: string, newName: string): Promise<boolean> {
  const session = await loadSession(id);
  if (!session) return false;

  session.name = newName;
  await saveSession(session);
  return true;
}

export async function duplicateSession(id: string): Promise<Session | null> {
  const original = await loadSession(id);
  if (!original) return null;

  const duplicate: Session = {
    ...original,
    id: generateId(),
    name: `${original.name} (copy)`,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await saveSession(duplicate);
  return duplicate;
}

// Auto-save helper for use with useChat
export function createAutoSaver(sessionId: string, debounceMs = 2000) {
  let timeout: NodeJS.Timeout | null = null;
  let pendingMessages: Message[] = [];

  return {
    save: (messages: Message[]) => {
      pendingMessages = messages;

      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(async () => {
        const session = await loadSession(sessionId);
        if (session) {
          session.messages = pendingMessages;
          await saveSession(session);
        }
      }, debounceMs);
    },

    flush: async () => {
      if (timeout) clearTimeout(timeout);
      const session = await loadSession(sessionId);
      if (session && pendingMessages.length > 0) {
        session.messages = pendingMessages;
        await saveSession(session);
      }
    },
  };
}

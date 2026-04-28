// Soul reflection — periodically asks Argo to update its own self-description
// based on a recent conversation. Designed to evolve SLOWLY (small diffs, no rewrites).
import type { LLMProvider, Message } from '../providers/types.js';
import { loadSoul, saveSoul } from './soul.js';

const REFLECTION_PROMPT = `Below is your current self-description (your "soul") and a recent conversation you had with the user.

Your task: produce an UPDATED version of the soul that reflects what you noticed about this interaction. Rules:

1. Make MINIMAL changes — at most a sentence added, a sentence edited, or a sentence removed.
2. Only change something if the conversation gave you genuine evidence. "User said one thing once" is not evidence; "user has corrected me on this pattern multiple times" or "I caught myself doing X again and it landed well" is evidence.
3. Never wholesale rewrite. That's not growth, that's amnesia.
4. Keep the existing markdown structure (Voice / Values / Quirks / etc).
5. If nothing meaningful changed, return the soul unchanged.

Output ONLY the new soul markdown — no preamble, no explanation, no code fences.`;

const MIN_TURNS_FOR_REFLECTION = 6;

let reflectionInProgress = false;

export interface ReflectionResult {
  changed: boolean;
  oldContent: string;
  newContent: string;
  charsDelta: number;
}

/**
 * Run a reflection pass. Should be called in the background, not awaited
 * by the user-facing chat loop.
 */
export async function reflect(
  provider: LLMProvider,
  recentMessages: Message[]
): Promise<ReflectionResult | null> {
  // Concurrency guard — don't run two reflections at once
  if (reflectionInProgress) return null;

  // Need enough conversation to reflect on
  const userTurns = recentMessages.filter(m => m.role === 'user').length;
  if (userTurns < MIN_TURNS_FOR_REFLECTION) return null;

  reflectionInProgress = true;

  try {
    const soul = await loadSoul();

    // Build the conversation summary — strip tool messages, keep user/assistant
    const summary = recentMessages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .slice(-20) // last 20 turns max
      .map(m => `**${m.role}**: ${m.content.slice(0, 800)}`)
      .join('\n\n');

    const prompt = `${REFLECTION_PROMPT}

## Current soul

${soul.content}

## Recent conversation

${summary}

## Updated soul`;

    let newContent = '';
    for await (const chunk of provider.chat(
      [{ role: 'user', content: prompt }],
      { temperature: 0.3 } // low temp — we want stability
    )) {
      if (chunk.type === 'text' && chunk.content) {
        newContent += chunk.content;
      } else if (chunk.type === 'error') {
        return null;
      }
    }

    newContent = newContent.trim();

    // Sanity checks: must be non-empty, must contain key headers, must not be wildly different in size
    if (!newContent) return null;
    if (!newContent.includes('## Voice') && !newContent.toLowerCase().includes('voice')) {
      // Likely the model hallucinated something off-format
      return null;
    }
    const sizeDelta = Math.abs(newContent.length - soul.content.length);
    if (sizeDelta > soul.content.length * 0.5) {
      // More than 50% change — too aggressive, reject
      return null;
    }

    // No change?
    if (newContent === soul.content) {
      return {
        changed: false,
        oldContent: soul.content,
        newContent,
        charsDelta: 0,
      };
    }

    await saveSoul(newContent);

    return {
      changed: true,
      oldContent: soul.content,
      newContent,
      charsDelta: newContent.length - soul.content.length,
    };
  } catch {
    return null;
  } finally {
    reflectionInProgress = false;
  }
}

// Reflection cadence helper — every Nth user message
export function shouldReflect(userMessageCount: number, every = 8): boolean {
  return userMessageCount > 0 && userMessageCount % every === 0;
}

import { useState, useCallback, useRef, useEffect } from 'react';
import type { LLMProvider, Message, ToolCall } from '../providers/types.js';
import type { ToolContext, ToolResult } from '../tools/types.js';
import { toolRegistry } from '../tools/index.js';
import { createAgentTool } from '../tools/agent.js';
import { createPartyTool } from '../tools/party.js';
import { skillRegistry } from '../skills/registry.js';
import { loadSoul, formatSoulForPrompt, ensureSoulExists } from '../soul/soul.js';
import { reflect, shouldReflect } from '../soul/reflect.js';
import { getWorkspace, workspaceSystemContext, sessionSystemContext } from '../utils/workspace.js';
import { loadMemory, formatMemoryForPrompt } from '../utils/memory.js';
import { recordChars } from '../utils/tokenRate.js';
import { sessionRegistry } from '../sessions/shell.js';

/**
 * Single source of truth: messages.
 *
 * Streaming writes directly into the most-recently-appended assistant
 * message. The bubble that renders that message keeps the same key from
 * first byte to last, so nothing reflows or vanishes when the turn ends.
 */
export interface ChatState {
  messages: Message[];
  isLoading: boolean;
  error: string | null;
  /** Comma-joined list of tools currently executing — used by the status line. */
  executingTool: string | null;
}

export interface UseChatOptions {
  provider: LLMProvider;
  systemPrompt?: string;
  onToolCall?: (toolCall: ToolCall) => void;
  onToolResult?: (toolCall: ToolCall, result: ToolResult) => void;
  requestConfirmation?: (message: string) => Promise<boolean>;
}

/** Maximum concurrent read-only tool calls (Claude Code pattern). */
const MAX_TOOL_CONCURRENCY = 10;

/**
 * Separate read-only tools from write tools.
 * Read-only tools run concurrently (up to MAX_TOOL_CONCURRENCY).
 * Write tools run serially to prevent race conditions.
 */
function partitionToolCalls(toolCalls: ToolCall[]): { readOnly: ToolCall[]; write: ToolCall[] } {
  const readOnly: ToolCall[] = [];
  const write: ToolCall[] = [];
  
  for (const tc of toolCalls) {
    if (toolRegistry.isReadOnly(tc.name)) {
      readOnly.push(tc);
    } else {
      write.push(tc);
    }
  }
  
  return { readOnly, write };
}

export function useChat(options: UseChatOptions) {
  const { provider, systemPrompt, onToolCall, onToolResult, requestConfirmation } = options;

  // Re-register agent + party tools every time the provider changes
  useEffect(() => {
    toolRegistry.register(createAgentTool(provider));
    toolRegistry.register(createPartyTool(provider));
    skillRegistry.load();
    ensureSoulExists();
  }, [provider]);

  const soulRef = useRef<string>('');
  useEffect(() => {
    loadSoul().then(s => { soulRef.current = formatSoulForPrompt(s); });
  }, []);

  const memoryRef = useRef<string>('');
  useEffect(() => {
    loadMemory().then(m => { memoryRef.current = formatMemoryForPrompt(m); });
  }, []);

  const [state, setState] = useState<ChatState>({
    messages: [],
    isLoading: false,
    error: null,
    executingTool: null,
  });

  // Critical: messagesRef maintains sync with state.messages to avoid race conditions
  // in async operations. React state updates are batched and may not reflect
  // immediately in concurrent async flows.
  const messagesRef = useRef<Message[]>([]);
  
  // Track abort controller for cancellation
  const abortControllerRef = useRef<AbortController | null>(null);
  
  // Pending skill injection
  const pendingSkillRef = useRef<string>('');

  // Per-turn streaming buffers. Updated synchronously in the chunk loop; flushed
  // (at most every 60 ms) into the in-flight assistant message via setState.
  const reasoningBufRef = useRef('');
  const responseBufRef = useRef('');
  const toolCallsBufRef = useRef<ToolCall[]>([]);
  const flushPendingRef = useRef(false);
  const lastFlushRef = useRef(0);
  const FLUSH_INTERVAL_MS = 60;

  // Queue for pending messages to send
  const messageQueueRef = useRef<string[]>([]);
  const isProcessingQueueRef = useRef(false);

  /** Patch the most-recently-appended (streaming) assistant message in-place. */
  const flushStream = useCallback(() => {
    flushPendingRef.current = false;
    lastFlushRef.current = Date.now();
    setState(s => {
      if (s.messages.length === 0) return s;
      const idx = s.messages.length - 1;
      const last = s.messages[idx];
      if (last.role !== 'assistant' || !last.streaming) return s;

      const newContent = responseBufRef.current;
      const newReasoning = reasoningBufRef.current || undefined;
      const newToolCalls = toolCallsBufRef.current.length > 0
        ? toolCallsBufRef.current
        : undefined;

      // Bail if nothing changed — saves a render cascade per flush
      if (
        last.content === newContent &&
        last.reasoning === newReasoning &&
        last.toolCalls?.length === newToolCalls?.length
      ) return s;

      const next = [...s.messages];
      next[idx] = {
        ...last,
        content: newContent,
        reasoning: newReasoning,
        toolCalls: newToolCalls,
      };
      // Keep messagesRef in sync
      messagesRef.current = next;
      return { ...s, messages: next };
    });
  }, []);

  const scheduleFlush = useCallback(() => {
    if (flushPendingRef.current) return;
    const elapsed = Date.now() - lastFlushRef.current;
    if (elapsed >= FLUSH_INTERVAL_MS) {
      flushStream();
      return;
    }
    flushPendingRef.current = true;
    setTimeout(flushStream, FLUSH_INTERVAL_MS - elapsed);
  }, [flushStream]);

  const reloadMemory = useCallback(async () => {
    memoryRef.current = formatMemoryForPrompt(await loadMemory());
  }, []);

  const injectSkill = useCallback((body: string) => {
    pendingSkillRef.current = pendingSkillRef.current
      ? pendingSkillRef.current + '\n\n' + body
      : body;
  }, []);

  const workspace = getWorkspace();
  
  const executeToolCalls = useCallback(
    async (toolCalls: ToolCall[], abortSignal?: AbortSignal): Promise<Message[]> => {
      // Check for abort before starting
      if (abortSignal?.aborted) {
        return [];
      }

      setState(s => ({
        ...s,
        executingTool: toolCalls.map(t => t.name).join(', '),
      }));

      // Partition tools: read-only run concurrently, write tools run serially
      const { readOnly, write } = partitionToolCalls(toolCalls);
      
      const results: Message[] = [];
      
      // Execute read-only tools concurrently (up to MAX_TOOL_CONCURRENCY at a time)
      if (readOnly.length > 0) {
        // Chunk into batches for concurrency limit
        const batches: ToolCall[][] = [];
        for (let i = 0; i < readOnly.length; i += MAX_TOOL_CONCURRENCY) {
          batches.push(readOnly.slice(i, i + MAX_TOOL_CONCURRENCY));
        }
        
        for (const batch of batches) {
          if (abortSignal?.aborted) break;
          
          const batchResults = await Promise.all(
            batch.map(async (toolCall) => {
              // Check abort before each tool
              if (abortSignal?.aborted) {
                return {
                  role: 'tool' as const,
                  content: 'Error: Tool execution cancelled by user',
                  toolCallId: toolCall.id,
                };
              }
              
              onToolCall?.(toolCall);
              
              const toolContext: ToolContext = {
                cwd: workspace.cwd,
                env: process.env as Record<string, string>,
                requestConfirmation,
                abortSignal,
              };
              
              const result = await toolRegistry.execute(
                toolCall.name,
                toolCall.arguments,
                toolContext
              );
              onToolResult?.(toolCall, result);
              
              return {
                role: 'tool' as const,
                content: result.success
                  ? result.output
                  : `Error: ${result.error}\n${result.output}`,
                toolCallId: toolCall.id,
              };
            })
          );
          results.push(...batchResults);
        }
      }
      
      // Execute write tools serially to prevent race conditions
      for (const toolCall of write) {
        if (abortSignal?.aborted) {
          results.push({
            role: 'tool',
            content: 'Error: Tool execution cancelled by user',
            toolCallId: toolCall.id,
          });
          break;
        }
        
        onToolCall?.(toolCall);
        
        const toolContext: ToolContext = {
          cwd: workspace.cwd,
          env: process.env as Record<string, string>,
          requestConfirmation,
          abortSignal,
        };
        
        const result = await toolRegistry.execute(
          toolCall.name,
          toolCall.arguments,
          toolContext
        );
        onToolResult?.(toolCall, result);
        
        results.push({
          role: 'tool',
          content: result.success
            ? result.output
            : `Error: ${result.error}\n${result.output}`,
          toolCallId: toolCall.id,
        });
      }

      setState(s => ({ ...s, executingTool: null }));
      return results;
    },
    [onToolCall, onToolResult, workspace.cwd, requestConfirmation]
  );

  const processMessageQueue = useCallback(async () => {
    if (isProcessingQueueRef.current) return;
    isProcessingQueueRef.current = true;

    while (messageQueueRef.current.length > 0) {
      const content = messageQueueRef.current.shift();
      if (!content) break;
      
      // Process each message...
      // (sendMessage logic moved to processMessage to avoid duplication)
      await sendMessageInternal(content);
    }

    isProcessingQueueRef.current = false;
  }, []);

  const sendMessageInternal = useCallback(
    async (content: string) => {
      abortControllerRef.current = new AbortController();
      const abortSignal = abortControllerRef.current.signal;

      const matchedSkills = skillRegistry.match(content);
      const matchedSkillContext = matchedSkills.length > 0
        ? '\n\n--- Active Skills ---\n' + matchedSkills
            .slice(0, 3)
            .map(s => `## ${s.frontmatter.name}\n${s.body}`)
            .join('\n\n')
        : '';
      const injected = pendingSkillRef.current;
      pendingSkillRef.current = '';
      const skillContext = matchedSkillContext + (injected ? '\n\n--- Injected Skill ---\n' + injected : '');

      const userMessage: Message = { role: 'user', content };

      // Seed: append user message + a streaming assistant placeholder.
      // Use messagesRef for consistent state
      let currentMessages = [...messagesRef.current, userMessage];
      messagesRef.current = currentMessages;
      setState(s => ({
        ...s,
        messages: currentMessages,
        isLoading: true,
        error: null,
      }));

      let continueLoop = true;
      // Tracks state across iterations of THIS user turn:
      //   - hadToolIteration: did any iteration emit tool calls?
      //   - autoContinued: have we already auto-continued once this turn?
      // Together they gate the silent-turn auto-continue: only fire when the
      // model just ran tools and then went silent on the very next iteration,
      // and only ever fire once per user message so it can't loop.
      let hadToolIteration = false;
      let autoContinued = false;

      while (continueLoop) {
        // Check for abort at loop start
        if (abortSignal.aborted) {
          continueLoop = false;
          break;
        }

        continueLoop = false;

        // Clear per-turn buffers and push a fresh streaming placeholder.
        reasoningBufRef.current = '';
        responseBufRef.current = '';
        toolCallsBufRef.current = [];

        const placeholder: Message = {
          role: 'assistant',
          content: '',
          streaming: true,
        };
        currentMessages = [...currentMessages, placeholder];
        messagesRef.current = currentMessages;
        setState(s => ({ ...s, messages: currentMessages }));

        let reasoningContent = '';
        let responseContent = '';
        const turnToolCalls: ToolCall[] = [];

        try {
          const activeSession = sessionRegistry.active.info;
          const sessionCtx = sessionSystemContext(activeSession.id, activeSession.kind, activeSession.label);
          const stream = provider.chat(currentMessages.slice(0, -1), {
            systemPrompt: (systemPrompt || '') + workspaceSystemContext(workspace) + sessionCtx + soulRef.current + memoryRef.current + skillContext,
            tools: toolRegistry.getAll(),
          });

          for await (const chunk of stream) {
            if (abortSignal.aborted) break;

            if (chunk.type === 'reasoning' && chunk.content) {
              reasoningContent += chunk.content;
              recordChars(chunk.content.length);
              reasoningBufRef.current = reasoningContent;
              scheduleFlush();
            } else if (chunk.type === 'text' && chunk.content) {
              responseContent += chunk.content;
              recordChars(chunk.content.length);
              responseBufRef.current = responseContent;
              scheduleFlush();
            } else if (chunk.type === 'tool_call' && chunk.toolCall) {
              turnToolCalls.push(chunk.toolCall);
              toolCallsBufRef.current = [...turnToolCalls];
              scheduleFlush();
            } else if (chunk.type === 'error' && chunk.error) {
              setState(s => ({ ...s, error: chunk.error! }));
            }
          }

          flushStream();

          // Settle: copy buffers into the final assistant message and clear
          // its streaming flag. Reflect both in `currentMessages` (used to
          // build the next request) and in React state + messagesRef.
          const settled: Message = {
            role: 'assistant',
            content: responseContent,
            reasoning: reasoningContent || undefined,
            toolCalls: turnToolCalls.length > 0 ? turnToolCalls : undefined,
            streaming: false,
          };
          currentMessages = [...currentMessages.slice(0, -1), settled];
          messagesRef.current = currentMessages;
          setState(s => {
            const next = [...s.messages];
            // The streaming placeholder is the last message we pushed.
            next[next.length - 1] = settled;
            return { ...s, messages: next };
          });

          if (turnToolCalls.length > 0 && !abortSignal.aborted) {
            hadToolIteration = true;
            const toolResults = await executeToolCalls(turnToolCalls, abortSignal);
            currentMessages = [...currentMessages, ...toolResults];
            messagesRef.current = currentMessages;
            setState(s => ({ ...s, messages: [...s.messages, ...toolResults] }));
            continueLoop = true;
          } else if (
            !abortSignal.aborted &&
            !autoContinued &&
            hadToolIteration &&
            !responseContent.trim()
          ) {
            // Silent turn after a tool round — model thought (maybe) but
            // emitted nothing actionable. Inject a synthetic continue prompt
            // and re-enter the loop. Capped at one auto-continue per user
            // message so a genuinely-stuck model still settles.
            autoContinued = true;
            const nudge: Message = {
              role: 'user',
              content: '(continue: produce your text answer or call the next tool. if your task is complete, summarize what you did.)',
              auto: true,
            };
            currentMessages = [...currentMessages, nudge];
            messagesRef.current = currentMessages;
            setState(s => ({ ...s, messages: [...s.messages, nudge] }));
            continueLoop = true;
          }
        } catch (err) {
          const error = err as Error;
          setState(s => ({ ...s, error: error.message }));
          // Settle the placeholder so the bubble doesn't sit with streaming=true
          setState(s => {
            const next = [...s.messages];
            const idx = next.length - 1;
            if (next[idx]?.role === 'assistant' && next[idx].streaming) {
              next[idx] = { ...next[idx], streaming: false };
            }
            messagesRef.current = next;
            return { ...s, messages: next };
          });
          continueLoop = false;
        }
      }

      setState(s => ({ ...s, isLoading: false }));

      // Background soul reflection
      const userTurns = currentMessages.filter(m => m.role === 'user').length;
      if (shouldReflect(userTurns, 8)) {
        reflect(provider, currentMessages).then(result => {
          if (result?.changed) {
            loadSoul().then(s => { soulRef.current = formatSoulForPrompt(s); });
          }
        }).catch(() => { /* silent */ });
      }
    },
    [provider, systemPrompt, executeToolCalls, scheduleFlush, flushStream, workspace, requestConfirmation]
  );

  const sendMessage = useCallback(
    async (content: string) => {
      if (state.isLoading) {
        // Queue the message if already processing
        messageQueueRef.current.push(content);
        return;
      }
      await sendMessageInternal(content);
    },
    [state.isLoading, sendMessageInternal]
  );

  const abort = useCallback(() => {
    abortControllerRef.current?.abort();
    setState(s => {
      const next = [...s.messages];
      const idx = next.length - 1;
      if (next[idx]?.role === 'assistant' && next[idx].streaming) {
        next[idx] = { ...next[idx], streaming: false };
      }
      messagesRef.current = next;
      return { ...s, messages: next, isLoading: false };
    });
  }, []);

  const clearHistory = useCallback(() => {
    const empty: Message[] = [];
    messagesRef.current = empty;
    setState({
      messages: empty,
      isLoading: false,
      error: null,
      executingTool: null,
    });
  }, []);

  const setMessages = useCallback((messages: Message[]) => {
    messagesRef.current = messages;
    setState(s => ({ ...s, messages }));
  }, []);

  return {
    ...state,
    sendMessage,
    abort,
    clearHistory,
    reloadMemory,
    injectSkill,
    setMessages,
  };
}
import { useState, useCallback, useRef, useEffect } from 'react';
import type { LLMProvider, Message, ToolCall, StreamChunk } from '../providers/types.js';
import type { Tool, ToolContext, ToolResult } from '../tools/types.js';
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

export interface ChatState {
  messages: Message[];
  isLoading: boolean;
  currentReasoning: string;
  currentResponse: string;
  error: string | null;
  pendingToolCalls: ToolCall[];
  executingTool: string | null;
}

export interface UseChatOptions {
  provider: LLMProvider;
  systemPrompt?: string;
  onToolCall?: (toolCall: ToolCall) => void;
  onToolResult?: (toolCall: ToolCall, result: ToolResult) => void;
  requestConfirmation?: (message: string) => Promise<boolean>;
}

export function useChat(options: UseChatOptions) {
  const { provider, systemPrompt, onToolCall, onToolResult, requestConfirmation } = options;

  // Re-register agent + party tools every time the provider changes (hot-swap support)
  useEffect(() => {
    toolRegistry.register(createAgentTool(provider));
    toolRegistry.register(createPartyTool(provider));
    skillRegistry.load();
    ensureSoulExists();
  }, [provider]);

  // Cached soul content — reload after reflection
  const soulRef = useRef<string>('');
  useEffect(() => {
    loadSoul().then(s => { soulRef.current = formatSoulForPrompt(s); });
  }, []);

  // Cached project memory — reload via reloadMemory()
  const memoryRef = useRef<string>('');
  useEffect(() => {
    loadMemory().then(m => { memoryRef.current = formatMemoryForPrompt(m); });
  }, []);

  const [state, setState] = useState<ChatState>({
    messages: [],
    isLoading: false,
    currentReasoning: '',
    currentResponse: '',
    error: null,
    pendingToolCalls: [],
    executingTool: null,
  });

  const abortControllerRef = useRef<AbortController | null>(null);

  // Skill injection — set by /skill <name> to attach a skill to the next message
  const pendingSkillRef = useRef<string>('');

  // Streaming-state throttle: buffer chunks in refs and flush to React state at
  // most every 60ms. The previous approach setState'd on every token (then
  // throttled the *displayed* value), which still re-rendered the parent
  // 50–100×/s and produced visible flicker.
  const reasoningBufRef = useRef('');
  const responseBufRef = useRef('');
  const flushPendingRef = useRef(false);
  const lastFlushRef = useRef(0);
  const FLUSH_INTERVAL_MS = 60;

  const flushStream = useCallback(() => {
    flushPendingRef.current = false;
    lastFlushRef.current = Date.now();
    setState(s => {
      if (
        s.currentReasoning === reasoningBufRef.current &&
        s.currentResponse === responseBufRef.current
      ) return s;
      return {
        ...s,
        currentReasoning: reasoningBufRef.current,
        currentResponse: responseBufRef.current,
      };
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
  const toolContext: ToolContext = {
    cwd: workspace.cwd,
    env: process.env as Record<string, string>,
    requestConfirmation,
  };

  const executeToolCalls = useCallback(
    async (toolCalls: ToolCall[]): Promise<Message[]> => {
      // Run all tool calls in PARALLEL — this is what enables agent fan-out
      setState((s) => ({
        ...s,
        executingTool: toolCalls.map(t => t.name).join(', '),
      }));

      const results = await Promise.all(
        toolCalls.map(async (toolCall) => {
          onToolCall?.(toolCall);
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

      setState((s) => ({ ...s, executingTool: null }));
      return results;
    },
    [onToolCall, onToolResult, toolContext]
  );

  const sendMessage = useCallback(
    async (content: string) => {
      if (state.isLoading) return;

      // Create abort controller
      abortControllerRef.current = new AbortController();

      // Match skills based on user input
      const matchedSkills = skillRegistry.match(content);
      const matchedSkillContext = matchedSkills.length > 0
        ? '\n\n--- Active Skills ---\n' + matchedSkills
            .slice(0, 3)
            .map(s => `## ${s.frontmatter.name}\n${s.body}`)
            .join('\n\n')
        : '';
      // Append any explicitly-injected skill from /skill <name>, then clear
      const injected = pendingSkillRef.current;
      pendingSkillRef.current = '';
      const skillContext = matchedSkillContext + (injected ? '\n\n--- Injected Skill ---\n' + injected : '');

      const userMessage: Message = { role: 'user', content };
      const newMessages = [...state.messages, userMessage];

      setState((s) => ({
        ...s,
        messages: newMessages,
        isLoading: true,
        currentReasoning: '',
        currentResponse: '',
        error: null,
        pendingToolCalls: [],
      }));

      let currentMessages = newMessages;
      let continueLoop = true;

      while (continueLoop) {
        continueLoop = false;
        let reasoningContent = '';
        let responseContent = '';
        const toolCalls: ToolCall[] = [];

        // Reset live-stream state at the top of each iteration so a previous
        // iteration's text doesn't bleed into the next iteration's empty bubble.
        reasoningBufRef.current = '';
        responseBufRef.current = '';
        setState((s) => ({
          ...s,
          currentReasoning: '',
          currentResponse: '',
          pendingToolCalls: [],
        }));

        try {
          const activeSession = sessionRegistry.active.info;
          const sessionCtx = sessionSystemContext(activeSession.id, activeSession.kind, activeSession.label);
          const stream = provider.chat(currentMessages, {
            systemPrompt: (systemPrompt || '') + workspaceSystemContext(workspace) + sessionCtx + soulRef.current + memoryRef.current + skillContext,
            tools: toolRegistry.getAll(),
          });

          for await (const chunk of stream) {
            if (abortControllerRef.current?.signal.aborted) {
              break;
            }

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
              toolCalls.push(chunk.toolCall);
              setState((s) => ({
                ...s,
                pendingToolCalls: [...s.pendingToolCalls, chunk.toolCall!],
              }));
            } else if (chunk.type === 'error' && chunk.error) {
              setState((s) => ({ ...s, error: chunk.error! }));
            }
          }

          // Final flush of streamed buffers before we move on
          flushStream();

          // Add assistant message
          const assistantMessage: Message = {
            role: 'assistant',
            content: responseContent,
            toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
          };
          currentMessages = [...currentMessages, assistantMessage];

          // Execute tool calls if any (in parallel)
          if (toolCalls.length > 0) {
            const toolResults = await executeToolCalls(toolCalls);
            currentMessages = [...currentMessages, ...toolResults];
            continueLoop = true; // Continue to get LLM response to tool results
          }
        } catch (err) {
          const error = err as Error;
          setState((s) => ({ ...s, error: error.message }));
          continueLoop = false;
        }
      }

      setState((s) => ({
        ...s,
        messages: currentMessages,
        isLoading: false,
        currentReasoning: '',
        currentResponse: '',
        pendingToolCalls: [],
      }));

      // Background soul reflection — don't await, let it run async
      const userTurns = currentMessages.filter(m => m.role === 'user').length;
      if (shouldReflect(userTurns, 8)) {
        reflect(provider, currentMessages).then(result => {
          if (result?.changed) {
            // Reload cached soul for the next request
            loadSoul().then(s => { soulRef.current = formatSoulForPrompt(s); });
          }
        }).catch(() => { /* silent fail — reflection is non-critical */ });
      }
    },
    [state.messages, state.isLoading, provider, systemPrompt, executeToolCalls]
  );

  const abort = useCallback(() => {
    abortControllerRef.current?.abort();
    setState((s) => ({
      ...s,
      isLoading: false,
      currentReasoning: '',
      currentResponse: '',
    }));
  }, []);

  const clearHistory = useCallback(() => {
    setState({
      messages: [],
      isLoading: false,
      currentReasoning: '',
      currentResponse: '',
      error: null,
      pendingToolCalls: [],
      executingTool: null,
    });
  }, []);

  const setMessages = useCallback((messages: Message[]) => {
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

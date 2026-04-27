import { useState, useCallback, useRef, useEffect } from 'react';
import type { LLMProvider, Message, ToolCall, StreamChunk } from '../providers/types.js';
import type { Tool, ToolContext, ToolResult } from '../tools/types.js';
import { toolRegistry } from '../tools/index.js';
import { createAgentTool } from '../tools/agent.js';
import { skillRegistry } from '../skills/registry.js';

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

  // Re-register agent tool every time the provider changes (hot-swap support)
  useEffect(() => {
    toolRegistry.register(createAgentTool(provider));
    skillRegistry.load();
  }, [provider]);

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

  const toolContext: ToolContext = {
    cwd: process.cwd(),
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
      const skillContext = matchedSkills.length > 0
        ? '\n\n--- Active Skills ---\n' + matchedSkills
            .slice(0, 3)
            .map(s => `## ${s.frontmatter.name}\n${s.body}`)
            .join('\n\n')
        : '';

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

        try {
          const stream = provider.chat(currentMessages, {
            systemPrompt: (systemPrompt || '') + skillContext,
            tools: toolRegistry.getAll(),
          });

          for await (const chunk of stream) {
            if (abortControllerRef.current?.signal.aborted) {
              break;
            }

            if (chunk.type === 'reasoning' && chunk.content) {
              reasoningContent += chunk.content;
              setState((s) => ({
                ...s,
                currentReasoning: reasoningContent,
              }));
            } else if (chunk.type === 'text' && chunk.content) {
              responseContent += chunk.content;
              setState((s) => ({
                ...s,
                currentResponse: responseContent,
              }));
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

  return {
    ...state,
    sendMessage,
    abort,
    clearHistory,
  };
}

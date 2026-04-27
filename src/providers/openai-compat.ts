import OpenAI from 'openai';
import type {
  LLMProvider,
  Message,
  StreamChunk,
  ChatOptions,
  ToolCall,
} from './types.js';
import type { Tool } from '../tools/types.js';
import { toToolDefinition } from '../tools/types.js';

export class OpenAICompatProvider implements LLMProvider {
  name = 'openai-compatible';
  private client: OpenAI;
  private model: string;
  private supportsTools: boolean;

  constructor(options: {
    baseUrl?: string;
    apiKey?: string;
    model?: string;
    supportsTools?: boolean;
  } = {}) {
    this.client = new OpenAI({
      baseURL: options.baseUrl || 'http://localhost:8000/v1',
      apiKey: options.apiKey || 'not-needed',
    });
    this.model = options.model || 'default';
    this.supportsTools = options.supportsTools ?? true;
  }

  setModel(model: string): void {
    this.model = model;
  }

  supportsToolCalling(): boolean {
    return this.supportsTools;
  }

  async listModels(): Promise<string[]> {
    try {
      const response = await this.client.models.list();
      return response.data.map((m) => m.id);
    } catch (err) {
      console.error('Failed to list models:', err);
      return [];
    }
  }

  async *chat(
    messages: Message[],
    options?: ChatOptions
  ): AsyncGenerator<StreamChunk, void, unknown> {
    const model = options?.model || this.model;
    const useTools =
      this.supportsTools && options?.tools && options.tools.length > 0;

    // Convert messages to OpenAI format
    const openaiMessages: OpenAI.ChatCompletionMessageParam[] = messages.map(
      (m) => {
        if (m.role === 'tool') {
          return {
            role: 'tool' as const,
            content: m.content,
            tool_call_id: m.toolCallId || '',
          };
        }
        if (m.role === 'assistant' && m.toolCalls) {
          return {
            role: 'assistant' as const,
            content: m.content || null,
            tool_calls: m.toolCalls.map((tc) => ({
              id: tc.id,
              type: 'function' as const,
              function: {
                name: tc.name,
                arguments: JSON.stringify(tc.arguments),
              },
            })),
          };
        }
        return {
          role: m.role as 'user' | 'assistant' | 'system',
          content: m.content,
        };
      }
    );

    // Add system prompt if provided
    if (options?.systemPrompt) {
      openaiMessages.unshift({
        role: 'system',
        content: options.systemPrompt,
      });
    }

    // If tools provided but not supported, add to system prompt
    if (options?.tools && !useTools) {
      const toolPrompt = this.buildToolPrompt(options.tools);
      const systemIdx = openaiMessages.findIndex((m) => m.role === 'system');
      if (systemIdx >= 0 && typeof openaiMessages[systemIdx].content === 'string') {
        openaiMessages[systemIdx].content += '\n\n' + toolPrompt;
      } else {
        openaiMessages.unshift({
          role: 'system',
          content: toolPrompt,
        });
      }
    }

    try {
      const tools = useTools
        ? options?.tools?.map((t) => {
            const def = toToolDefinition(t);
            return {
              type: 'function' as const,
              function: def.function,
            };
          })
        : undefined;

      const stream = await this.client.chat.completions.create({
        model,
        messages: openaiMessages,
        stream: true,
        tools,
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens ?? 4096,
      });

      let fullContent = '';
      let hasYieldedContent = false;
      const toolCallsInProgress: Map<
        number,
        { id: string; name: string; arguments: string }
      > = new Map();

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta as Record<string, unknown>;

        // Handle regular content
        if (delta?.content) {
          fullContent += delta.content as string;
          hasYieldedContent = true;
          yield { type: 'text', content: delta.content as string };
        }

        // Handle Qwen3-style reasoning_content (thinking)
        if (delta?.reasoning_content) {
          const thinking = delta.reasoning_content as string;
          yield { type: 'reasoning', content: thinking };
        }

        // Handle streaming tool calls
        const toolCalls = delta?.tool_calls as Array<{ index: number; id?: string; function?: { name?: string; arguments?: string } }> | undefined;
        if (toolCalls && Array.isArray(toolCalls)) {
          for (const tc of toolCalls) {
            const idx = tc.index;

            if (!toolCallsInProgress.has(idx)) {
              toolCallsInProgress.set(idx, {
                id: tc.id || '',
                name: tc.function?.name || '',
                arguments: '',
              });
            }

            const inProgress = toolCallsInProgress.get(idx)!;

            if (tc.id) inProgress.id = tc.id;
            if (tc.function?.name) inProgress.name = tc.function.name;
            if (tc.function?.arguments)
              inProgress.arguments += tc.function.arguments;
          }
        }

        // Check for finish reason
        if (chunk.choices[0]?.finish_reason === 'tool_calls') {
          // Emit completed tool calls
          for (const tc of toolCallsInProgress.values()) {
            try {
              const toolCall: ToolCall = {
                id: tc.id,
                name: tc.name,
                arguments: JSON.parse(tc.arguments || '{}'),
              };
              yield { type: 'tool_call', toolCall };
            } catch {
              // Skip malformed tool calls
            }
          }
        }
      }

      // If using XML fallback, parse tool calls from content
      if (!useTools && options?.tools) {
        const xmlToolCalls = this.parseXMLToolCalls(fullContent);
        for (const tc of xmlToolCalls) {
          yield { type: 'tool_call', toolCall: tc };
        }
      }

      yield { type: 'done' };
    } catch (err) {
      const error = err as Error;
      yield { type: 'error', error: error.message };
    }
  }

  private buildToolPrompt(tools: Tool[]): string {
    const toolDefs = tools.map((t) => {
      const def = toToolDefinition(t);
      return `- ${def.function.name}: ${def.function.description}\n  Parameters: ${JSON.stringify(def.function.parameters)}`;
    });

    return `You have access to the following tools:

${toolDefs.join('\n\n')}

When you need to use a tool, respond with:
<tool_call>
<name>tool_name</name>
<arguments>{"param": "value"}</arguments>
</tool_call>

You can use multiple tool calls in one response. After receiving tool results, continue your response.`;
  }

  private parseXMLToolCalls(content: string): ToolCall[] {
    const toolCalls: ToolCall[] = [];
    const regex =
      /<tool_call>\s*<name>([^<]+)<\/name>\s*<arguments>([\s\S]*?)<\/arguments>\s*<\/tool_call>/g;

    let match;
    while ((match = regex.exec(content)) !== null) {
      try {
        const args = JSON.parse(match[2].trim());
        toolCalls.push({
          id: `call_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          name: match[1].trim(),
          arguments: args,
        });
      } catch {
        continue;
      }
    }

    return toolCalls;
  }
}

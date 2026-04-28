import { Ollama } from 'ollama';
import type {
  LLMProvider,
  Message,
  StreamChunk,
  ChatOptions,
  ToolCall,
} from './types.js';
import type { Tool } from '../tools/types.js';
import { toToolDefinition } from '../tools/types.js';

// Models known to support native tool calling
const TOOL_CAPABLE_MODELS = [
  'llama3.1',
  'llama3.2',
  'llama3.3',
  'mistral',
  'mixtral',
  'qwen2',
  'qwen2.5',
  'command-r',
  'command-r-plus',
];

function modelSupportsTools(model: string): boolean {
  const normalized = model.toLowerCase();
  return TOOL_CAPABLE_MODELS.some(
    (m) => normalized.startsWith(m) || normalized.includes(m)
  );
}

export class OllamaProvider implements LLMProvider {
  name = 'ollama';
  private client: Ollama;
  private model: string;
  private baseUrl: string;
  private apiKey?: string;

  constructor(options: { baseUrl?: string; model?: string; apiKey?: string } = {}) {
    this.baseUrl = options.baseUrl || 'http://localhost:11434';
    this.model = options.model || 'llama3.2';
    this.apiKey = options.apiKey;

    // Ollama Cloud and other authed Ollama instances need a Bearer token
    const headers: Record<string, string> = {};
    if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`;

    this.client = new Ollama({ host: this.baseUrl, headers });
  }

  setModel(model: string): void {
    this.model = model;
  }

  supportsToolCalling(): boolean {
    return modelSupportsTools(this.model);
  }

  async listModels(): Promise<string[]> {
    try {
      const response = await this.client.list();
      return response.models.map((m) => m.name);
    } catch (err) {
      console.error('Failed to list Ollama models:', err);
      return [];
    }
  }

  async *chat(
    messages: Message[],
    options?: ChatOptions
  ): AsyncGenerator<StreamChunk, void, unknown> {
    const model = options?.model || this.model;
    const useNativeTools =
      options?.tools && options.tools.length > 0 && modelSupportsTools(model);

    // Convert messages to Ollama format
    const ollamaMessages = messages.map((m) => {
      if (m.role === 'tool') {
        // Tool results go back as user messages in Ollama
        return {
          role: 'user' as const,
          content: `Tool result for ${m.toolCallId}:\n${m.content}`,
        };
      }
      return {
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content,
      };
    });

    // Add system prompt if provided
    if (options?.systemPrompt) {
      ollamaMessages.unshift({
        role: 'system',
        content: options.systemPrompt,
      });
    }

    // If tools provided but model doesn't support native tools, add to system prompt
    if (options?.tools && !useNativeTools) {
      const toolPrompt = this.buildToolPrompt(options.tools);
      const systemIdx = ollamaMessages.findIndex((m) => m.role === 'system');
      if (systemIdx >= 0) {
        ollamaMessages[systemIdx].content += '\n\n' + toolPrompt;
      } else {
        ollamaMessages.unshift({
          role: 'system',
          content: toolPrompt,
        });
      }
    }

    try {
      const response = await this.client.chat({
        model,
        messages: ollamaMessages,
        stream: true,
        tools: useNativeTools
          ? options?.tools?.map((t) => ({
              type: 'function' as const,
              function: {
                name: t.name,
                description: t.description,
                parameters: t.parameters,
              },
            }))
          : undefined,
        options: {
          temperature: options?.temperature ?? 0.7,
          num_predict: options?.maxTokens,
        },
      });

      let fullContent = '';
      let pendingToolCalls: ToolCall[] = [];

      for await (const chunk of response) {
        if (chunk.message?.content) {
          fullContent += chunk.message.content;
          yield { type: 'text', content: chunk.message.content };
        }

        // Handle native tool calls
        if (chunk.message?.tool_calls) {
          for (const tc of chunk.message.tool_calls) {
            const toolCall: ToolCall = {
              id: `call_${Date.now()}_${Math.random().toString(36).slice(2)}`,
              name: tc.function.name,
              arguments:
                typeof tc.function.arguments === 'string'
                  ? JSON.parse(tc.function.arguments)
                  : tc.function.arguments,
            };
            pendingToolCalls.push(toolCall);
            yield { type: 'tool_call', toolCall };
          }
        }
      }

      // If using XML fallback, parse tool calls from content
      if (!useNativeTools && options?.tools) {
        const xmlToolCalls = this.parseXMLToolCalls(fullContent);
        for (const tc of xmlToolCalls) {
          yield { type: 'tool_call', toolCall: tc };
        }
      }

      yield { type: 'done' };
    } catch (err) {
      const error = err as Error & { status_code?: number };
      let msg = error.message || String(err);

      // Detect when the server returned HTML (means we hit a website, not the API)
      if (msg.includes('<!doctype html') || msg.includes('<html') || msg.includes('Unexpected token')) {
        msg = `Got HTML response from ${this.baseUrl} — this usually means:
  · Wrong baseUrl (Ollama Cloud uses https://ollama.com, but model must be a *-cloud variant like gpt-oss:120b-cloud)
  · Missing or invalid API key (Ollama Cloud requires one)
  · The endpoint is the marketing site, not an Ollama API
Original error: ${error.message}`;
      } else if (msg.includes('401') || msg.includes('Unauthorized')) {
        msg = `Authentication failed at ${this.baseUrl}. Check your API key (Ctrl+R → providers).`;
      } else if (msg.includes('404')) {
        msg = `Endpoint not found at ${this.baseUrl}. Verify the URL is correct and points to an Ollama-compatible API. (Original: ${error.message})`;
      }

      yield { type: 'error', error: msg };
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
        // Skip malformed tool calls
        continue;
      }
    }

    return toolCalls;
  }
}

import type { Tool } from '../tools/types.js';

export interface Message {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface StreamChunk {
  type: 'text' | 'reasoning' | 'tool_call' | 'done' | 'error';
  content?: string;
  toolCall?: ToolCall;
  error?: string;
}

export interface LLMProvider {
  name: string;

  /**
   * Send messages to the LLM and stream the response
   */
  chat(
    messages: Message[],
    options?: ChatOptions
  ): AsyncGenerator<StreamChunk, void, unknown>;

  /**
   * List available models
   */
  listModels(): Promise<string[]>;

  /**
   * Check if the current model supports native tool calling
   */
  supportsToolCalling(): boolean;
}

export interface ChatOptions {
  model?: string;
  tools?: Tool[];
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ProviderConfig {
  type: 'ollama' | 'openai-compatible';
  baseUrl?: string;
  apiKey?: string;
  defaultModel?: string;
}

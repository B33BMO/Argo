import type { Tool } from '../tools/types.js';

export interface Message {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  /** Captured reasoning_content (Qwen3 / DeepSeek-R1 thinking). Optional so
   *  past sessions without it still load. Persists per turn so the user can
   *  audit what the model thought after the fact — especially when it went
   *  silent and we need to know why. */
  reasoning?: string;
  /** True while the model is actively streaming into this message. Lets the
   *  bubble render a cursor and keep the same DOM node from first byte to
   *  last — no swap between a "streaming overlay" and the committed message,
   *  which is what used to cause the "says what it's doing, then bam, gone"
   *  flicker. Cleared once the turn settles. */
  streaming?: boolean;
  /** Synthetic message injected by Argo itself (e.g. an auto-continue nudge
   *  after a silent turn). Shown to the model in conversation context but
   *  rendered as a small dim hint in the UI rather than a full bubble. */
  auto?: boolean;
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

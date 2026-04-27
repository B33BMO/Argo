// Token counting and context window management

// Rough token estimation (actual count varies by model's tokenizer)
// This uses a simple heuristic: ~4 characters per token for English text

export interface TokenEstimate {
  tokens: number;
  characters: number;
}

export function estimateTokens(text: string): TokenEstimate {
  const characters = text.length;
  // Rough estimate: 1 token ≈ 4 characters for English
  // This is a simplification; real tokenizers vary
  const tokens = Math.ceil(characters / 4);

  return { tokens, characters };
}

export interface MessageTokens {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  tokens: number;
}

export function estimateMessageTokens(messages: { role: string; content: string }[]): MessageTokens[] {
  return messages.map(msg => ({
    role: msg.role as MessageTokens['role'],
    content: msg.content,
    tokens: estimateTokens(msg.content).tokens,
  }));
}

export interface ContextWindowInfo {
  usedTokens: number;
  maxTokens: number;
  percentUsed: number;
  remainingTokens: number;
  breakdown: {
    system: number;
    user: number;
    assistant: number;
    tool: number;
  };
}

// Common context window sizes
export const CONTEXT_WINDOWS: Record<string, number> = {
  // Ollama/Open source models
  'llama2': 4096,
  'llama3': 8192,
  'llama3.1': 128000,
  'llama3.2': 128000,
  'mistral': 8192,
  'mixtral': 32768,
  'qwen': 32768,
  'qwen2': 32768,
  'qwen2.5': 32768,
  'qwen3': 32768,
  'codellama': 16384,
  'deepseek': 16384,
  'deepseek-coder': 16384,
  'phi': 2048,
  'phi3': 4096,
  'gemma': 8192,
  'gemma2': 8192,

  // OpenAI
  'gpt-3.5-turbo': 16385,
  'gpt-4': 8192,
  'gpt-4-turbo': 128000,
  'gpt-4o': 128000,

  // Default fallback
  'default': 8192,
};

export function getContextWindowSize(modelName: string): number {
  const lowerModel = modelName.toLowerCase();

  // Try exact match first
  if (CONTEXT_WINDOWS[lowerModel]) {
    return CONTEXT_WINDOWS[lowerModel];
  }

  // Try prefix match
  for (const [key, size] of Object.entries(CONTEXT_WINDOWS)) {
    if (lowerModel.startsWith(key) || lowerModel.includes(key)) {
      return size;
    }
  }

  return CONTEXT_WINDOWS.default;
}

export function calculateContextUsage(
  messages: { role: string; content: string }[],
  modelName: string
): ContextWindowInfo {
  const maxTokens = getContextWindowSize(modelName);
  const messageTokens = estimateMessageTokens(messages);

  const breakdown = {
    system: 0,
    user: 0,
    assistant: 0,
    tool: 0,
  };

  let usedTokens = 0;

  for (const msg of messageTokens) {
    usedTokens += msg.tokens;
    if (msg.role in breakdown) {
      breakdown[msg.role as keyof typeof breakdown] += msg.tokens;
    }
  }

  const percentUsed = (usedTokens / maxTokens) * 100;
  const remainingTokens = maxTokens - usedTokens;

  return {
    usedTokens,
    maxTokens,
    percentUsed,
    remainingTokens,
    breakdown,
  };
}

// Format token count for display
export function formatTokenCount(count: number): string {
  if (count >= 1000000) {
    return (count / 1000000).toFixed(1) + 'M';
  }
  if (count >= 1000) {
    return (count / 1000).toFixed(1) + 'K';
  }
  return count.toString();
}

// Get warning level based on context usage
export function getContextWarningLevel(percentUsed: number): 'safe' | 'warning' | 'danger' {
  if (percentUsed >= 90) return 'danger';
  if (percentUsed >= 75) return 'warning';
  return 'safe';
}

// Progress bar for context usage
export function renderContextBar(percentUsed: number, width: number = 20): string {
  const filled = Math.round((percentUsed / 100) * width);
  const empty = width - filled;

  const level = getContextWarningLevel(percentUsed);
  const char = level === 'danger' ? '█' : level === 'warning' ? '▓' : '░';

  return char.repeat(filled) + '░'.repeat(empty);
}

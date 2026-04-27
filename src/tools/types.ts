export interface JSONSchema {
  type: 'object' | 'string' | 'number' | 'boolean' | 'array';
  properties?: Record<string, JSONSchemaProperty>;
  required?: string[];
  items?: JSONSchemaProperty;
  description?: string;
  [key: string]: unknown; // Index signature for OpenAI compatibility
}

export interface JSONSchemaProperty {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description?: string;
  default?: unknown;
  enum?: string[];
  items?: JSONSchemaProperty;
  properties?: Record<string, JSONSchemaProperty>;
}

export interface ToolContext {
  /** Current working directory */
  cwd: string;
  /** Environment variables */
  env: Record<string, string>;
  /** Abort signal for cancellation */
  abortSignal?: AbortSignal;
  /** Request user confirmation */
  requestConfirmation?: (message: string) => Promise<boolean>;
}

export interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
  truncated?: boolean;
}

export interface Tool {
  name: string;
  description: string;
  parameters: JSONSchema;
  execute(
    params: Record<string, unknown>,
    context: ToolContext
  ): Promise<ToolResult>;
}

/**
 * Tool definition format for LLM APIs (OpenAI-style)
 */
export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: JSONSchema;
  };
}

/**
 * Convert a Tool to a ToolDefinition for the LLM API
 */
export function toToolDefinition(tool: Tool): ToolDefinition {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  };
}

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
  /**
   * Structured side-data the UI can render (e.g. prior file content captured
   * by write_file so the card can show a diff). Tool authors can populate
   * arbitrary keys; the UI reads only the ones it knows about.
   */
  metadata?: Record<string, unknown>;
}

export interface ValidationResult {
  success: boolean;
  error?: string;
  data?: Record<string, unknown>;
}

export interface Tool {
  name: string;
  description: string;
  parameters: JSONSchema;
  /**
   * Returns true if this tool only reads data and has no side effects.
   * Read-only tools can run concurrently with other read-only tools.
   * Tools that write files, execute commands, or modify state should return false.
   */
  isReadOnly?: () => boolean;
  /**
   * Returns true if this tool needs user confirmation before execution.
   * Override to provide fine-grained permission control.
   * If not defined, the registry will check needsConfirmationForInput().
   */
  needsConfirmation?: () => boolean;
  /**
   * Validate input parameters before execution.
   * Returns validation result with parsed data on success.
   */
  validateInput?: (params: Record<string, unknown>) => ValidationResult;
  /**
   * Execute the tool with validated parameters.
   */
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

/**
 * Helper to create a validation result for valid input
 */
export function validInput(data: Record<string, unknown>): ValidationResult {
  return { success: true, data };
}

/**
 * Helper to create a validation result for invalid input
 */
export function invalidInput(error: string): ValidationResult {
  return { success: false, error };
}
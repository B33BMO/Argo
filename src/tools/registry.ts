import type { Tool, ToolContext, ToolResult, ToolDefinition } from './types.js';
import { toToolDefinition } from './types.js';

export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();

  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  getAll(): Tool[] {
    return Array.from(this.tools.values());
  }

  getToolDefinitions(): ToolDefinition[] {
    return this.getAll().map(toToolDefinition);
  }

  /**
   * Check if a tool is read-only (no side effects).
   * Used to determine if multiple tools can run concurrently.
   */
  isReadOnly(name: string): boolean {
    const tool = this.tools.get(name);
    if (!tool) return false;
    return tool.isReadOnly?.() ?? false;
  }

  /**
   * Check if all tools in a list are read-only.
   */
  allReadOnly(toolNames: string[]): boolean {
    return toolNames.every(name => this.isReadOnly(name));
  }

  async execute(
    name: string,
    params: Record<string, unknown>,
    context: ToolContext
  ): Promise<ToolResult> {
    const tool = this.tools.get(name);

    if (!tool) {
      return {
        success: false,
        output: '',
        error: `Unknown tool: ${name}`,
      };
    }

    // Validate input if tool has a schema
    if (tool.validateInput) {
      const validation = tool.validateInput(params);
      if (!validation.success) {
        return {
          success: false,
          output: '',
          error: `Validation error: ${validation.error}`,
        };
      }
    }

    try {
      return await tool.execute(params, context);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        output: '',
        error: `Tool execution failed: ${error}`,
      };
    }
  }
}

// Global registry instance
export const toolRegistry = new ToolRegistry();
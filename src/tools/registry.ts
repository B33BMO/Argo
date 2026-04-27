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

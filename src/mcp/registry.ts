// MCP registry — loads ~/.argo/mcp.yaml, spawns servers, registers their tools.
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import YAML from 'yaml';
import { McpClient } from './client.js';
import type { McpServerConfig, McpServersFile } from './types.js';
import { toolRegistry } from '../tools/registry.js';
import type { Tool, ToolContext, ToolResult } from '../tools/types.js';

const MCP_CONFIG_PATH = path.join(os.homedir(), '.argo', 'mcp.yaml');

class McpRegistry {
  private clients: Map<string, McpClient> = new Map();

  async loadConfig(): Promise<McpServerConfig[]> {
    try {
      const content = await fs.readFile(MCP_CONFIG_PATH, 'utf-8');
      const parsed = YAML.parse(content) as McpServersFile;
      if (!parsed?.servers) return [];

      return Object.entries(parsed.servers)
        .filter(([, cfg]) => cfg.enabled !== false)
        .map(([id, cfg]) => ({
          id,
          command: cfg.command,
          args: cfg.args,
          env: this.expandEnv(cfg.env),
          enabled: cfg.enabled,
        }));
    } catch {
      return [];
    }
  }

  /**
   * Expand ${ENV_VAR} placeholders in env values.
   */
  private expandEnv(env?: Record<string, string>): Record<string, string> | undefined {
    if (!env) return undefined;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(env)) {
      out[k] = v.replace(/\$\{([A-Z_][A-Z0-9_]*)\}/gi, (_, name) => process.env[name] || '');
    }
    return out;
  }

  async writeDefaultConfig(): Promise<void> {
    const dir = path.dirname(MCP_CONFIG_PATH);
    await fs.mkdir(dir, { recursive: true });
    const example = `# Argo MCP Server Configuration
# Each server is spawned at startup; its tools are registered with Argo.
# Reference env vars with \${VAR_NAME}.
#
# Examples (uncomment to enable):
#
# servers:
#   filesystem:
#     command: npx
#     args: ["-y", "@modelcontextprotocol/server-filesystem", "/Users/you/projects"]
#
#   github:
#     command: npx
#     args: ["-y", "@modelcontextprotocol/server-github"]
#     env:
#       GITHUB_PERSONAL_ACCESS_TOKEN: \${GITHUB_TOKEN}
#
#   postgres:
#     command: npx
#     args: ["-y", "@modelcontextprotocol/server-postgres", "postgresql://localhost/mydb"]
#     enabled: false

servers: {}
`;
    try {
      await fs.access(MCP_CONFIG_PATH);
    } catch {
      await fs.writeFile(MCP_CONFIG_PATH, example, 'utf-8');
    }
  }

  /**
   * Start all configured servers, register their tools.
   * Failures on individual servers don't block startup.
   */
  async startAll(): Promise<{ started: string[]; failed: { id: string; error: string }[] }> {
    await this.writeDefaultConfig();
    const configs = await this.loadConfig();
    const started: string[] = [];
    const failed: { id: string; error: string }[] = [];

    await Promise.all(
      configs.map(async (cfg) => {
        const client = new McpClient(cfg);
        try {
          await client.start();
          this.clients.set(cfg.id, client);
          this.registerToolsFromClient(client);
          started.push(cfg.id);
        } catch (err) {
          failed.push({ id: cfg.id, error: (err as Error).message });
          client.stop();
        }
      })
    );

    return { started, failed };
  }

  private registerToolsFromClient(client: McpClient): void {
    for (const mcpTool of client.getTools()) {
      // Namespace the tool: mcp__<server>__<tool>
      const name = `mcp__${client.id}__${mcpTool.name}`;
      const tool: Tool = {
        name,
        description: `[MCP:${client.id}] ${mcpTool.description || mcpTool.name}`,
        parameters: {
          type: 'object',
          properties: (mcpTool.inputSchema?.properties as Record<string, never>) || {},
          required: mcpTool.inputSchema?.required,
        },
        async execute(args: Record<string, unknown>, _context: ToolContext): Promise<ToolResult> {
          try {
            const result = await client.callTool(mcpTool.name, args);
            const text = result.content
              .map(c => {
                if (c.type === 'text') return c.text;
                if (c.type === 'resource') return c.resource.text || `[resource: ${c.resource.uri}]`;
                if (c.type === 'image') return `[image: ${c.mimeType}]`;
                return '';
              })
              .join('\n');
            return {
              success: !result.isError,
              output: text,
              error: result.isError ? text : undefined,
            };
          } catch (err) {
            return {
              success: false,
              output: '',
              error: (err as Error).message,
            };
          }
        },
      };
      toolRegistry.register(tool);
    }
  }

  list(): { id: string; tools: number; alive: boolean }[] {
    return Array.from(this.clients.values()).map(c => ({
      id: c.id,
      tools: c.getTools().length,
      alive: c.isInitialized(),
    }));
  }

  stopAll(): void {
    for (const c of this.clients.values()) c.stop();
    this.clients.clear();
  }

  getConfigPath(): string {
    return MCP_CONFIG_PATH;
  }
}

export const mcpRegistry = new McpRegistry();

process.on('exit', () => mcpRegistry.stopAll());

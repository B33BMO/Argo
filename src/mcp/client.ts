// MCP client — speaks JSON-RPC 2.0 over a child process's stdio.
// Each line of stdout is one JSON-RPC message (LSP-style framing not used by MCP stdio).
import { spawn, type ChildProcess } from 'child_process';
import type {
  JsonRpcRequest,
  JsonRpcResponse,
  McpToolDef,
  McpToolsListResult,
  McpToolCallResult,
  McpServerConfig,
} from './types.js';

const PROTOCOL_VERSION = '2024-11-05';
const REQUEST_TIMEOUT_MS = 30_000;

export class McpClient {
  readonly id: string;
  private proc: ChildProcess | null = null;
  private nextId = 1;
  private pending = new Map<number | string, {
    resolve: (v: unknown) => void;
    reject: (err: Error) => void;
    timer: NodeJS.Timeout;
  }>();
  private buffer = '';
  private initialized = false;
  private dead = false;
  private deathReason?: string;
  private tools: McpToolDef[] = [];

  constructor(public readonly config: McpServerConfig) {
    this.id = config.id;
  }

  async start(): Promise<void> {
    if (this.proc) return;

    const env = { ...process.env, ...(this.config.env || {}) };

    this.proc = spawn(this.config.command, this.config.args || [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env,
    });

    this.proc.stdout?.on('data', (chunk: Buffer) => {
      this.buffer += chunk.toString();
      this.processBuffer();
    });

    this.proc.stderr?.on('data', (chunk: Buffer) => {
      // MCP servers often log diagnostics to stderr — silently swallow unless we want to surface
      // For now, drop. Could route to a debug log.
      void chunk;
    });

    this.proc.on('exit', (code, signal) => {
      this.dead = true;
      this.deathReason = signal ? `signal ${signal}` : `exit ${code}`;
      // Reject any in-flight requests
      for (const [, p] of this.pending) {
        clearTimeout(p.timer);
        p.reject(new Error(`MCP server "${this.id}" exited: ${this.deathReason}`));
      }
      this.pending.clear();
    });

    this.proc.on('error', (err) => {
      this.dead = true;
      this.deathReason = err.message;
    });

    // Initialize handshake
    await this.request('initialize', {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'argo', version: '0.1.0' },
    });

    // MCP requires a follow-up "initialized" notification
    this.notify('notifications/initialized', {});

    this.initialized = true;

    // Discover tools
    try {
      const result = await this.request<McpToolsListResult>('tools/list', {});
      this.tools = result.tools || [];
    } catch {
      this.tools = [];
    }
  }

  private processBuffer(): void {
    let idx;
    while ((idx = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, idx).trim();
      this.buffer = this.buffer.slice(idx + 1);
      if (!line) continue;

      try {
        const msg = JSON.parse(line) as JsonRpcResponse;
        if (msg.id !== undefined && this.pending.has(msg.id)) {
          const p = this.pending.get(msg.id)!;
          clearTimeout(p.timer);
          this.pending.delete(msg.id);
          if (msg.error) {
            p.reject(new Error(`MCP error ${msg.error.code}: ${msg.error.message}`));
          } else {
            p.resolve(msg.result);
          }
        }
        // Ignore notifications/server-initiated requests for now
      } catch {
        // Malformed line, skip
      }
    }
  }

  private async request<T = unknown>(method: string, params: Record<string, unknown>): Promise<T> {
    if (this.dead) throw new Error(`MCP server "${this.id}" is not running: ${this.deathReason}`);

    const id = this.nextId++;
    const req: JsonRpcRequest = { jsonrpc: '2.0', id, method, params };

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP request "${method}" timed out after ${REQUEST_TIMEOUT_MS}ms`));
      }, REQUEST_TIMEOUT_MS);

      this.pending.set(id, {
        resolve: resolve as (v: unknown) => void,
        reject,
        timer,
      });

      try {
        this.proc?.stdin?.write(JSON.stringify(req) + '\n');
      } catch (err) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(err as Error);
      }
    });
  }

  private notify(method: string, params: Record<string, unknown>): void {
    if (this.dead) return;
    const note = { jsonrpc: '2.0', method, params };
    try {
      this.proc?.stdin?.write(JSON.stringify(note) + '\n');
    } catch {
      // ignore
    }
  }

  getTools(): McpToolDef[] {
    return this.tools;
  }

  isInitialized(): boolean {
    return this.initialized && !this.dead;
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<McpToolCallResult> {
    return this.request<McpToolCallResult>('tools/call', { name, arguments: args });
  }

  stop(): void {
    if (this.dead) return;
    try {
      this.proc?.kill();
    } catch {
      // ignore
    }
    this.dead = true;
  }
}

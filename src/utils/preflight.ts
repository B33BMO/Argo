// Preflight checks — quick health snapshot of Argo's environment.
import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { ptyAvailable } from '../sessions/shell.js';
import { mcpRegistry } from '../mcp/registry.js';
import { getMemoryPath } from './memory.js';
import { getWorkspace } from './workspace.js';
import { getSoulPath } from '../soul/soul.js';
import type { LLMProvider } from '../providers/types.js';

const execAsync = promisify(exec);

export type CheckStatus = 'ok' | 'warn' | 'fail' | 'pending';

export interface PreflightCheck {
  id: string;
  label: string;
  status: CheckStatus;
  detail?: string;
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function which(cmd: string): Promise<string | null> {
  try {
    const { stdout } = await execAsync(`command -v ${cmd}`, { timeout: 1500 });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

export async function runPreflight(provider: LLMProvider): Promise<PreflightCheck[]> {
  const ws = getWorkspace();
  const checks: PreflightCheck[] = [];

  // Provider reachability
  try {
    const models = await provider.listModels();
    checks.push({
      id: 'provider',
      label: `Provider: ${provider.name}`,
      status: 'ok',
      detail: `${models.length} model${models.length === 1 ? '' : 's'} available`,
    });
  } catch (err) {
    checks.push({
      id: 'provider',
      label: `Provider: ${provider.name}`,
      status: 'fail',
      detail: (err as Error).message.slice(0, 80),
    });
  }

  // Workspace
  checks.push({
    id: 'workspace',
    label: 'Workspace',
    status: 'ok',
    detail: ws.display,
  });

  // Git
  try {
    const { stdout } = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd: ws.cwd, timeout: 1500 });
    checks.push({ id: 'git', label: 'Git', status: 'ok', detail: `branch ${stdout.trim()}` });
  } catch {
    checks.push({ id: 'git', label: 'Git', status: 'warn', detail: 'not a repo' });
  }

  // PTY
  checks.push({
    id: 'pty',
    label: 'PTY (node-pty)',
    status: ptyAvailable() ? 'ok' : 'warn',
    detail: ptyAvailable() ? 'real TTY available' : 'not built — using pipe fallback',
  });

  // MCP servers
  const mcp = mcpRegistry.list();
  if (mcp.length === 0) {
    checks.push({ id: 'mcp', label: 'MCP', status: 'ok', detail: 'no servers configured' });
  } else {
    const dead = mcp.filter(m => !m.alive).length;
    checks.push({
      id: 'mcp',
      label: 'MCP',
      status: dead === 0 ? 'ok' : 'warn',
      detail: `${mcp.length} server${mcp.length === 1 ? '' : 's'}${dead > 0 ? `, ${dead} dead` : ''}`,
    });
  }

  // Soul file
  const soulPath = getSoulPath();
  checks.push({
    id: 'soul',
    label: 'Soul',
    status: (await fileExists(soulPath)) ? 'ok' : 'warn',
    detail: path.basename(soulPath),
  });

  // Memory file
  const memPath = getMemoryPath();
  checks.push({
    id: 'memory',
    label: 'Project memory',
    status: (await fileExists(memPath)) ? 'ok' : 'warn',
    detail: (await fileExists(memPath)) ? '.argo/memory.md' : 'not created — /memory to init',
  });

  // ssh availability (for ! sessions)
  const sshPath = await which('ssh');
  checks.push({
    id: 'ssh',
    label: 'ssh client',
    status: sshPath ? 'ok' : 'warn',
    detail: sshPath || 'not in PATH',
  });

  return checks;
}

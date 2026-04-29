/**
 * Permission persistence system for tool execution.
 * Stores allowed operations in ~/.argo/.permissions.json
 * to avoid repeated confirmation prompts.
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';

const ARGO_HOME = path.join(os.homedir(), '.argo');
const PERMISSIONS_FILENAME = 'permissions.json';

export interface PermissionStore {
  /** Tool names that are fully allowed (no confirmation needed) */
  allowedTools: string[];
  /** Bash command patterns that are allowed (e.g., "git:*", "npm:*") */
  allowedCommands: string[];
  /** File paths that are allowed for write operations */
  allowedWritePaths: string[];
  /** Timestamp of last update */
  lastUpdated: string;
}

/**
 * Get the path to the permissions file.
 */
export function getPermissionsPath(): string {
  return path.join(ARGO_HOME, PERMISSIONS_FILENAME);
}

/**
 * Ensure the permissions directory exists.
 */
async function ensurePermissionsDir(): Promise<void> {
  try {
    await fs.mkdir(ARGO_HOME, { recursive: true });
  } catch (err) {
    // Ignore if already exists
    if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
  }
}

/**
 * Load permissions from disk. Returns default empty store if file doesn't exist.
 */
export async function loadPermissions(): Promise<PermissionStore> {
  try {
    const filePath = getPermissionsPath();
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    // Return default empty store
    return {
      allowedTools: [],
      allowedCommands: [],
      allowedWritePaths: [],
      lastUpdated: new Date().toISOString(),
    };
  }
}

/**
 * Save permissions to disk.
 */
export async function savePermissions(permissions: PermissionStore): Promise<void> {
  await ensurePermissionsDir();
  const filePath = getPermissionsPath();
  permissions.lastUpdated = new Date().toISOString();
  await fs.writeFile(filePath, JSON.stringify(permissions, null, 2), 'utf-8');
}

/**
 * Check if a tool is fully allowed (no confirmation needed).
 */
export function isToolAllowed(permissions: PermissionStore, toolName: string): boolean {
  return permissions.allowedTools.includes(toolName);
}

/**
 * Check if a command pattern is allowed.
 * Supports wildcards like "git:*" or "npm:*".
 */
export function isCommandAllowed(permissions: PermissionStore, command: string): boolean {
  const baseCommand = command.split(' ')[0] ?? '';
  
  for (const pattern of permissions.allowedCommands) {
    if (pattern === command) return true;
    if (pattern === `${baseCommand}:*`) return true;
    if (pattern.endsWith(':*') && baseCommand === pattern.slice(0, -2)) return true;
  }
  
  return false;
}

/**
 * Add a tool to the allowed list.
 */
export async function allowTool(toolName: string): Promise<void> {
  const permissions = await loadPermissions();
  if (!permissions.allowedTools.includes(toolName)) {
    permissions.allowedTools.push(toolName);
    permissions.allowedTools.sort();
    await savePermissions(permissions);
  }
}

/**
 * Add a command pattern to the allowed list.
 */
export async function allowCommand(commandOrPattern: string): Promise<void> {
  const permissions = await loadPermissions();
  if (!permissions.allowedCommands.includes(commandOrPattern)) {
    permissions.allowedCommands.push(commandOrPattern);
    permissions.allowedCommands.sort();
    await savePermissions(permissions);
  }
}

/**
 * Add a write path to the allowed list.
 */
export async function allowWritePath(filePath: string): Promise<void> {
  const permissions = await loadPermissions();
  if (!permissions.allowedWritePaths.includes(filePath)) {
    permissions.allowedWritePaths.push(filePath);
    permissions.allowedWritePaths.sort();
    await savePermissions(permissions);
  }
}

/**
 * Check if a write path is allowed.
 */
export function isWritePathAllowed(permissions: PermissionStore, filePath: string): boolean {
  // Check exact match
  if (permissions.allowedWritePaths.includes(filePath)) return true;
  
  // Check directory prefix (allow subdirectories)
  for (const allowedPath of permissions.allowedWritePaths) {
    if (filePath.startsWith(allowedPath + '/')) return true;
  }
  
  return false;
}

/**
 * Clear all permissions.
 */
export async function clearPermissions(): Promise<void> {
  await savePermissions({
    allowedTools: [],
    allowedCommands: [],
    allowedWritePaths: [],
    lastUpdated: new Date().toISOString(),
  });
}

/**
 * List of safe commands that never require confirmation.
 */
export const SAFE_COMMANDS = new Set([
  'ls', 'dir', 'pwd', 'echo', 'cat', 'head', 'tail', 'wc',
  'git status', 'git diff', 'git log', 'git branch', 'git remote',
  'npm list', 'npm ls', 'npm view',
  'yarn list', 'yarn info',
  'which', 'whereis', 'type',
  'date', 'whoami', 'hostname',
  'node --version', 'npm --version', 'python --version',
]);

/**
 * Check if a command is considered safe (no confirmation needed).
 */
export function isSafeCommand(command: string): boolean {
  const baseCommand = command.split(' ')[0] ?? '';
  
  // Check exact match
  if (SAFE_COMMANDS.has(command)) return true;
  if (SAFE_COMMANDS.has(baseCommand)) return true;
  
  // Safe patterns
  const safePatterns = [
    /^git status/,
    /^git diff/,
    /^git log/,
    /^ls(\s|$)/,
    /^cat\s+[^.]/, // cat with non-hidden file
    /^head\s+/,
    /^tail\s+/,
    /^echo\s+/,
  ];
  
  return safePatterns.some(p => p.test(command));
}
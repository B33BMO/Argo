// Workspace = the directory Argo was launched in.
// Captured ONCE at startup so it's stable for the whole session.
import * as path from 'path';
import * as os from 'os';

const ARGO_HOME = path.resolve(os.homedir(), '.argo');

// Capture launch directory immediately
const LAUNCH_CWD = process.cwd();

export interface Workspace {
  /** Absolute path Argo was launched in. Stable for the session. */
  cwd: string;
  /** Display path (with ~ replacement, truncated for status bars). */
  display: string;
  /** Just the directory name (e.g., "Daedalus"). */
  name: string;
  /** True if cwd is inside the user's home dir. */
  isInHome: boolean;
}

export function getWorkspace(): Workspace {
  return buildWorkspace(LAUNCH_CWD);
}

function buildWorkspace(cwd: string): Workspace {
  const home = os.homedir();
  const isInHome = cwd === home || cwd.startsWith(home + path.sep);

  // Replace home with ~
  const display = isInHome ? '~' + cwd.slice(home.length) : cwd;
  const name = path.basename(cwd) || cwd;

  return { cwd, display, name, isInHome };
}

/** Format the workspace for display in the status bar. */
export function formatWorkspaceShort(ws: Workspace, maxLen = 35): string {
  if (ws.display.length <= maxLen) return ws.display;
  // Truncate middle: ~/projects/.../subdir/file
  const parts = ws.display.split(path.sep);
  if (parts.length <= 3) return '...' + ws.display.slice(-(maxLen - 3));
  return `${parts[0]}${path.sep}...${path.sep}${parts.slice(-2).join(path.sep)}`;
}

/** Build the workspace context block injected into the system prompt. */
export function workspaceSystemContext(ws: Workspace): string {
  return `\n\n# Working Directory\nYou are operating in: \`${ws.cwd}\`\nAll relative file paths resolve from here. The user expects you to work within this directory unless told otherwise.\n`;
}

/** Build the active-session context block. Called fresh on each request so it reflects current state. */
export function sessionSystemContext(activeId: string, kind: string, label: string): string {
  if (kind === 'local') {
    return ''; // No need to mention — this is the default
  }
  return `\n\n# Active Shell Session\nYour \`bash\` tool is currently routed through a **${kind.toUpperCase()}** session: \`${label}\`.\nCommands you run will execute on that remote/custom shell, NOT locally. Be aware:\n- File paths refer to the remote filesystem\n- The user may have switched sessions to give you remote access intentionally\n- If you need to run something locally, mention it and ask the user to switch back\n`;
}

// Guard: refuse to operate inside ~/.argo itself (avoid clobbering soul, sessions)
export function isInsideArgoHome(p: string): boolean {
  const resolved = path.resolve(p);
  return resolved === ARGO_HOME || resolved.startsWith(ARGO_HOME + path.sep);
}

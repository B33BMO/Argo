// Persistent shell sessions — keep child processes alive across commands so
// SSH (and other stateful shells) work naturally.
//
// Uses node-pty when available (real TTY → sudo, vim, password prompts work)
// and falls back to plain child_process pipes otherwise.
import { spawn, type ChildProcess } from 'child_process';

export interface RunResult {
  output: string;
  exitCode: number;
  durationMs: number;
}

export interface SessionInfo {
  id: string;
  label: string;
  kind: 'local' | 'ssh' | 'custom';
  command: string;
  args: string[];
  startedAt: Date;
  alive: boolean;
  hasPty: boolean;
}

// Try to load node-pty at module init. Will be undefined if it's not built.
type PtyTerminal = {
  write(data: string): void;
  onData(cb: (data: string) => void): { dispose: () => void };
  onExit(cb: (e: { exitCode: number; signal?: number }) => void): { dispose: () => void };
  kill(signal?: string): void;
  pid: number;
};

type PtyModule = {
  spawn(command: string, args: string[], opts: {
    name?: string;
    cols?: number;
    rows?: number;
    cwd?: string;
    env?: NodeJS.ProcessEnv;
  }): PtyTerminal;
};

let ptyModule: PtyModule | null = null;
try {
  // Dynamic require so missing native bindings don't break the app
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ptyModule = require('node-pty') as PtyModule;
} catch {
  ptyModule = null;
}

export function ptyAvailable(): boolean {
  return ptyModule !== null;
}

// ANSI escape sequence stripping — keeps output readable when echoed back to user
const ANSI_RE = /\x1b\[[0-9;?]*[a-zA-Z]|\x1b\][^\x07]*\x07|\x1b[()][AB012]|\r(?!\n)/g;

function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, '');
}

/**
 * A persistent shell. Sends each command to the underlying process's stdin
 * with a sentinel postfix so we can detect command boundaries.
 */
export class ShellSession {
  readonly info: SessionInfo;
  private proc: ChildProcess | null = null;
  private pty: PtyTerminal | null = null;
  private buffer = '';
  private busy = false;
  private dead = false;
  private deathReason?: string;
  private dataListeners: ((chunk: string) => void)[] = [];

  constructor(id: string, kind: SessionInfo['kind'], command: string, args: string[], label?: string, usePty = true) {
    const tryPty = usePty && ptyModule !== null;

    this.info = {
      id,
      label: label || id,
      kind,
      command,
      args,
      startedAt: new Date(),
      alive: true,
      hasPty: tryPty,
    };

    if (tryPty && ptyModule) {
      try {
        this.pty = ptyModule.spawn(command, args, {
          name: 'xterm-256color',
          cols: 120,
          rows: 30,
          env: { ...process.env, TERM: 'xterm-256color' },
        });
        this.pty.onData((data: string) => {
          this.buffer += data;
          for (const cb of this.dataListeners) cb(data);
        });
        this.pty.onExit(({ exitCode, signal }) => {
          this.dead = true;
          this.info.alive = false;
          this.deathReason = signal ? `signal ${signal}` : `exit ${exitCode}`;
        });
        return;
      } catch {
        // PTY spawn failed — fall through to child_process
        this.pty = null;
        this.info.hasPty = false;
      }
    }

    // Fallback: plain child_process with stdio pipes
    this.proc = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PS1: '', TERM: 'dumb' },
    });
    this.proc.stdout?.on('data', (chunk: Buffer) => {
      const s = chunk.toString();
      this.buffer += s;
      for (const cb of this.dataListeners) cb(s);
    });
    this.proc.stderr?.on('data', (chunk: Buffer) => {
      const s = chunk.toString();
      this.buffer += s;
      for (const cb of this.dataListeners) cb(s);
    });
    this.proc.on('exit', (code, signal) => {
      this.dead = true;
      this.info.alive = false;
      this.deathReason = signal ? `signal ${signal}` : `exit ${code}`;
    });
    this.proc.on('error', (err) => {
      this.dead = true;
      this.info.alive = false;
      this.deathReason = err.message;
    });
  }

  isAlive(): boolean { return !this.dead; }
  getDeathReason(): string | undefined { return this.deathReason; }

  /**
   * Subscribe to raw output (passed through ANSI-stripped). Returns disposer.
   */
  onData(cb: (chunk: string) => void): () => void {
    this.dataListeners.push(cb);
    return () => {
      this.dataListeners = this.dataListeners.filter(l => l !== cb);
    };
  }

  /**
   * Write raw input to the session (e.g., user typing into a sudo prompt).
   * Use sparingly — the normal path is .run().
   */
  writeRaw(data: string): void {
    if (this.dead) return;
    if (this.pty) this.pty.write(data);
    else this.proc?.stdin?.write(data);
  }

  async run(cmd: string, timeoutMs = 120_000): Promise<RunResult> {
    if (this.dead) {
      return {
        output: `Session is dead: ${this.deathReason || 'unknown reason'}`,
        exitCode: -1,
        durationMs: 0,
      };
    }

    if (this.busy) {
      return {
        output: 'Session is busy with another command',
        exitCode: -1,
        durationMs: 0,
      };
    }

    this.busy = true;
    const startTime = Date.now();
    const sentinel = `__ARGO_END_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}__`;

    return new Promise<RunResult>((resolve) => {
      this.buffer = '';
      const sentinelPattern = new RegExp(`${sentinel}:(-?\\d+)`);
      let timeoutHandle: NodeJS.Timeout | null = null;

      const checkBuffer = () => {
        const stripped = stripAnsi(this.buffer);
        const match = stripped.match(sentinelPattern);
        if (match) {
          if (timeoutHandle) clearTimeout(timeoutHandle);
          this.dataListeners = this.dataListeners.filter(l => l !== onData);

          const exitCode = parseInt(match[1], 10);
          const idx = stripped.indexOf(match[0]);
          // Strip the echoed command if PTY echoed it (PTY shells echo input)
          let output = stripped.slice(0, idx).replace(/\n+$/, '');
          // Remove the command echo if it's the first line(s) of output
          const cmdFirstLine = cmd.split('\n')[0];
          if (output.startsWith(cmdFirstLine)) {
            output = output.slice(cmdFirstLine.length).replace(/^\n+/, '');
          }
          this.buffer = '';
          this.busy = false;
          resolve({ output, exitCode, durationMs: Date.now() - startTime });
          return true;
        }
        return false;
      };

      const onData = (_: string) => { checkBuffer(); };
      this.dataListeners.push(onData);

      timeoutHandle = setTimeout(() => {
        this.dataListeners = this.dataListeners.filter(l => l !== onData);
        const stripped = stripAnsi(this.buffer);
        this.buffer = '';
        this.busy = false;
        resolve({
          output: stripped.replace(/\n+$/, '') + `\n[command timed out after ${timeoutMs}ms]`,
          exitCode: -1,
          durationMs: Date.now() - startTime,
        });
      }, timeoutMs);

      const wrapped = `{ ${cmd} ; } 2>&1\nprintf "\\n${sentinel}:%s\\n" "$?"\n`;

      try {
        if (this.pty) this.pty.write(wrapped);
        else this.proc?.stdin?.write(wrapped);
      } catch (err) {
        if (timeoutHandle) clearTimeout(timeoutHandle);
        this.dataListeners = this.dataListeners.filter(l => l !== onData);
        this.busy = false;
        resolve({
          output: `Failed to write to session: ${(err as Error).message}`,
          exitCode: -1,
          durationMs: Date.now() - startTime,
        });
      }
    });
  }

  close(): void {
    if (this.dead) return;
    try {
      if (this.pty) this.pty.kill();
      else {
        this.proc?.stdin?.end();
        this.proc?.kill();
      }
    } catch {
      // ignore
    }
    this.dead = true;
    this.info.alive = false;
  }
}

class SessionRegistry {
  private sessions: Map<string, ShellSession> = new Map();
  private activeId: string = 'local';

  ensureLocal(): ShellSession {
    let local = this.sessions.get('local');
    if (!local || !local.isAlive()) {
      local = new ShellSession('local', 'local', 'bash', ['--noprofile', '--norc'], 'local');
      this.sessions.set('local', local);
    }
    return local;
  }

  openSsh(target: string, extraArgs: string[] = []): ShellSession {
    const id = `ssh:${target}`;
    const existing = this.sessions.get(id);
    if (existing?.isAlive()) {
      this.activeId = id;
      return existing;
    }
    // With PTY available, drop the -T flag so we get a real TTY (interactive prompts work)
    const sshArgs = ptyAvailable()
      ? ['-tt', '-o', 'StrictHostKeyChecking=accept-new', ...extraArgs, target]
      : ['-T', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=accept-new', ...extraArgs, target];
    const session = new ShellSession(id, 'ssh', 'ssh', sshArgs, `ssh:${target}`);
    this.sessions.set(id, session);
    this.activeId = id;
    return session;
  }

  openCustom(id: string, command: string, args: string[], label?: string): ShellSession {
    const session = new ShellSession(id, 'custom', command, args, label);
    this.sessions.set(id, session);
    this.activeId = id;
    return session;
  }

  get active(): ShellSession {
    const sess = this.sessions.get(this.activeId);
    if (sess && sess.isAlive()) return sess;
    this.activeId = 'local';
    return this.ensureLocal();
  }

  setActive(id: string): boolean {
    const sess = this.sessions.get(id);
    if (sess?.isAlive()) {
      this.activeId = id;
      return true;
    }
    return false;
  }

  closeActive(): string | null {
    if (this.activeId === 'local') return null;
    const sess = this.sessions.get(this.activeId);
    if (sess) {
      sess.close();
      this.sessions.delete(this.activeId);
    }
    const closed = this.activeId;
    this.activeId = 'local';
    this.ensureLocal();
    return closed;
  }

  list(): SessionInfo[] {
    return Array.from(this.sessions.values()).map(s => s.info);
  }

  getActiveId(): string {
    return this.activeId;
  }

  closeAll(): void {
    for (const s of this.sessions.values()) s.close();
    this.sessions.clear();
    this.activeId = 'local';
  }
}

export const sessionRegistry = new SessionRegistry();
sessionRegistry.ensureLocal();

process.on('exit', () => sessionRegistry.closeAll());
process.on('SIGINT', () => {
  sessionRegistry.closeAll();
  process.exit(0);
});

// Clipboard utilities
import { exec, spawn } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Detect OS and available clipboard tools
type ClipboardMethod = 'pbcopy' | 'xclip' | 'xsel' | 'wl-copy' | 'powershell' | 'none';

async function detectClipboardMethod(): Promise<ClipboardMethod> {
  const platform = process.platform;

  if (platform === 'darwin') {
    return 'pbcopy'; // macOS always has pbcopy
  }

  if (platform === 'win32') {
    return 'powershell';
  }

  // Linux - try different tools
  const tools: ClipboardMethod[] = ['wl-copy', 'xclip', 'xsel'];

  for (const tool of tools) {
    try {
      await execAsync(`which ${tool}`);
      return tool;
    } catch {
      // Tool not found, try next
    }
  }

  return 'none';
}

let cachedMethod: ClipboardMethod | null = null;

async function getClipboardMethod(): Promise<ClipboardMethod> {
  if (cachedMethod === null) {
    cachedMethod = await detectClipboardMethod();
  }
  return cachedMethod;
}

// Copy text to clipboard
export async function copyToClipboard(text: string): Promise<boolean> {
  const method = await getClipboardMethod();

  if (method === 'none') {
    return false;
  }

  try {
    switch (method) {
      case 'pbcopy': {
        const proc = spawn('pbcopy');
        proc.stdin.write(text);
        proc.stdin.end();
        return new Promise((resolve) => {
          proc.on('close', (code) => resolve(code === 0));
        });
      }

      case 'xclip': {
        const proc = spawn('xclip', ['-selection', 'clipboard']);
        proc.stdin.write(text);
        proc.stdin.end();
        return new Promise((resolve) => {
          proc.on('close', (code) => resolve(code === 0));
        });
      }

      case 'xsel': {
        const proc = spawn('xsel', ['--clipboard', '--input']);
        proc.stdin.write(text);
        proc.stdin.end();
        return new Promise((resolve) => {
          proc.on('close', (code) => resolve(code === 0));
        });
      }

      case 'wl-copy': {
        const proc = spawn('wl-copy');
        proc.stdin.write(text);
        proc.stdin.end();
        return new Promise((resolve) => {
          proc.on('close', (code) => resolve(code === 0));
        });
      }

      case 'powershell': {
        // Escape for PowerShell
        const escaped = text.replace(/'/g, "''");
        await execAsync(`powershell -command "Set-Clipboard -Value '${escaped}'"`);
        return true;
      }
    }
  } catch {
    return false;
  }

  return false;
}

// Read from clipboard
export async function readFromClipboard(): Promise<string | null> {
  const method = await getClipboardMethod();

  if (method === 'none') {
    return null;
  }

  try {
    switch (method) {
      case 'pbcopy':
        const { stdout: pbOut } = await execAsync('pbpaste');
        return pbOut;

      case 'xclip':
        const { stdout: xclipOut } = await execAsync('xclip -selection clipboard -o');
        return xclipOut;

      case 'xsel':
        const { stdout: xselOut } = await execAsync('xsel --clipboard --output');
        return xselOut;

      case 'wl-copy':
        const { stdout: wlOut } = await execAsync('wl-paste');
        return wlOut;

      case 'powershell':
        const { stdout: psOut } = await execAsync('powershell -command "Get-Clipboard"');
        return psOut;
    }
  } catch {
    return null;
  }

  return null;
}

// Check if clipboard is available
export async function isClipboardAvailable(): Promise<boolean> {
  const method = await getClipboardMethod();
  return method !== 'none';
}

// Copy code block (with optional notification)
export interface CopyResult {
  success: boolean;
  method: ClipboardMethod;
  length: number;
}

export async function copyCodeBlock(code: string): Promise<CopyResult> {
  const method = await getClipboardMethod();
  const success = await copyToClipboard(code);

  return {
    success,
    method,
    length: code.length,
  };
}

// Extract code blocks from markdown
export function extractCodeBlocks(markdown: string): { language: string; code: string }[] {
  const blocks: { language: string; code: string }[] = [];
  const regex = /```(\w*)\n([\s\S]*?)```/g;

  let match;
  while ((match = regex.exec(markdown)) !== null) {
    blocks.push({
      language: match[1] || 'plain',
      code: match[2].trim(),
    });
  }

  return blocks;
}

// Copy last code block from response
export async function copyLastCodeBlock(response: string): Promise<CopyResult | null> {
  const blocks = extractCodeBlocks(response);

  if (blocks.length === 0) {
    return null;
  }

  const lastBlock = blocks[blocks.length - 1];
  return copyCodeBlock(lastBlock.code);
}

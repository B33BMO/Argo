// Central secrets guard. Used by every tool that touches the filesystem.
//
// Default policy: refuse silently (with a clear, non-leaky error). If the
// caller passes a `requestConfirmation` we prompt the user instead — that
// way you can still ask Argo to read your `.env` when you mean to.
import * as path from 'path';
import type { ToolContext } from '../tools/types.js';

// Files whose CONTENTS are presumed sensitive.
// Matching is on the basename (case-insensitive) unless noted.
const SENSITIVE_BASENAME_PATTERNS: RegExp[] = [
  /^\.env(\..*)?$/i,                // .env, .env.local, .env.production, .env.<anything>
  /^\.envrc$/i,                     // direnv
  /^\.netrc$/i,
  /^\.npmrc$/i,                     // often holds auth tokens
  /^\.pypirc$/i,
  /^\.gitconfig$/i,
  /^\.git-credentials$/i,
  /^id_(rsa|dsa|ecdsa|ed25519)$/i,  // SSH private keys
  /^id_(rsa|dsa|ecdsa|ed25519)\.pub$/i, // also flag pub keys (less critical but still)
  /^known_hosts$/i,
  /^authorized_keys$/i,
  /^credentials(\.json|\.yaml|\.yml|\.toml|\.ini)?$/i,
  /^secrets?(\.json|\.yaml|\.yml|\.toml|\.ini|\.env)?$/i,
  /\.pem$/i,
  /\.key$/i,
  /\.p12$/i,
  /\.pfx$/i,
  /\.jks$/i,
  /\.keystore$/i,
  /^kubeconfig$/i,
  /^config$/i,                      // only if directly under .ssh / .aws / .gcloud — checked below
];

// Path-segment based denylist (any of these segments anywhere in the path).
const SENSITIVE_PATH_SEGMENTS: string[] = [
  '.ssh',
  '.aws',
  '.gcloud',
  '.azure',
  '.kube',
  '.docker',
  '.config/gh',         // gh CLI auth
  '.config/git',
  '.config/op',         // 1Password CLI
  '.cargo/credentials', // narrowly only this cargo path matters
];

export function isSensitivePath(p: string): boolean {
  const norm = path.normalize(p);
  const lower = norm.toLowerCase();

  // Path-segment matches (handles e.g. "~/.ssh/anything", "project/.aws/credentials")
  const segments = lower.split(path.sep);
  for (const needle of SENSITIVE_PATH_SEGMENTS) {
    const parts = needle.toLowerCase().split('/');
    for (let i = 0; i + parts.length <= segments.length; i++) {
      let hit = true;
      for (let j = 0; j < parts.length; j++) {
        if (segments[i + j] !== parts[j]) { hit = false; break; }
      }
      if (hit) return true;
    }
  }

  // Basename matches
  const base = path.basename(norm);
  for (const re of SENSITIVE_BASENAME_PATTERNS) {
    if (re.test(base)) return true;
  }

  return false;
}

/**
 * Glob-friendly default ignore list. Pass into glob({ ignore: [...] }).
 * Covers the same surface area as isSensitivePath.
 */
export const SENSITIVE_GLOB_IGNORES: string[] = [
  '**/.env',
  '**/.env.*',
  '**/.envrc',
  '**/.netrc',
  '**/.npmrc',
  '**/.pypirc',
  '**/.gitconfig',
  '**/.git-credentials',
  '**/id_rsa',
  '**/id_rsa.pub',
  '**/id_dsa',
  '**/id_ecdsa',
  '**/id_ed25519',
  '**/id_ed25519.pub',
  '**/known_hosts',
  '**/authorized_keys',
  '**/credentials',
  '**/credentials.*',
  '**/secret',
  '**/secrets',
  '**/secret.*',
  '**/secrets.*',
  '**/*.pem',
  '**/*.key',
  '**/*.p12',
  '**/*.pfx',
  '**/*.jks',
  '**/*.keystore',
  '**/.ssh/**',
  '**/.aws/**',
  '**/.gcloud/**',
  '**/.azure/**',
  '**/.kube/**',
  '**/.docker/**',
  '**/.config/gh/**',
  '**/.config/op/**',
];

/**
 * Inline-content redactor. Used to scrub lines that look like KEY=secret
 * or "token": "...", in case a sensitive value lands in a file we DID
 * decide to read (e.g. accidental commit, or grep crossing a boundary).
 */
const SECRET_VALUE_PATTERNS: RegExp[] = [
  // KEY=value where KEY mentions secret/key/token/password (env-file style)
  /\b([A-Z0-9_]*(?:SECRET|TOKEN|KEY|PASSWORD|PASSWD|API[_-]?KEY|ACCESS[_-]?KEY|PRIVATE[_-]?KEY|CLIENT[_-]?SECRET)[A-Z0-9_]*)\s*=\s*([^\s#]+)/g,
  // "key": "value" json-style with secretish key
  /"([^"]*(?:secret|token|api[_-]?key|access[_-]?key|password|private[_-]?key|client[_-]?secret)[^"]*)"\s*:\s*"([^"]+)"/gi,
  // Bearer tokens in plain text
  /\b(Bearer|Token)\s+([A-Za-z0-9._\-+/=]{16,})/g,
  // GitHub PAT
  /\bgh[pous]_[A-Za-z0-9]{16,}/g,
  // Generic high-entropy hex/base64 over 32 chars after a colon/equals (cautious)
];

export function redactSecrets(text: string): { output: string; redactions: number } {
  let count = 0;
  let out = text;
  for (const re of SECRET_VALUE_PATTERNS) {
    out = out.replace(re, (full, a, b) => {
      count++;
      if (b !== undefined) return full.replace(b, '[REDACTED]');
      return '[REDACTED]';
    });
  }
  return { output: out, redactions: count };
}

/**
 * Gate access to a sensitive path. Returns true if the caller may proceed.
 * If the context provides a confirmation prompt, asks the user; otherwise
 * refuses by default.
 */
export async function requestSensitiveAccess(
  context: ToolContext,
  filePath: string,
  action: string
): Promise<boolean> {
  if (!context.requestConfirmation) return false;
  return context.requestConfirmation(
    `${action} a sensitive file:\n  ${filePath}\n\nThis file likely contains secrets (API keys, tokens, credentials). The model will see the contents.\n\nProceed?`
  );
}

/**
 * Heuristic: does a bash command look like it's trying to exfiltrate secrets?
 * Used to escalate confirmation, not to hard-block.
 */
export function bashLooksSecretFishing(cmd: string): boolean {
  if (/\benv\b(\s|$)/.test(cmd) && !/\benv\s+[A-Z]/.test(cmd)) return true; // bare `env`, not `env FOO=bar prog`
  if (/\bprintenv\b/.test(cmd)) return true;
  if (/\.env(\.[\w-]+)?\b/.test(cmd)) return true;
  if (/\bid_(rsa|dsa|ecdsa|ed25519)\b/.test(cmd)) return true;
  if (/\.ssh\//.test(cmd)) return true;
  if (/\.aws\//.test(cmd)) return true;
  if (/\bcredentials\b/i.test(cmd) && /(cat|less|more|head|tail|read)/i.test(cmd)) return true;
  return false;
}

/**
 * Boilerplate denial message — lets the LLM understand WHY without revealing
 * file contents.
 */
export function sensitiveDenialMessage(filePath: string): string {
  return `Access denied: \`${filePath}\` is on Argo's sensitive-files list (env files, SSH/AWS/GCP credentials, private keys, etc). To read it anyway, ask the user to run \`/init\`-style operations only after they've explicitly allowed this path, or have them paste the relevant snippet manually.`;
}

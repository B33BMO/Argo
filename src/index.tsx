import React from 'react';
import { render } from 'ink';
import { App } from './app.js';
import { OllamaProvider } from './providers/ollama.js';
import { OpenAICompatProvider } from './providers/openai-compat.js';
import { getActiveConfig, buildProvider } from './providers/manager.js';
import { loadConfig } from './utils/config.js';
import { setIconStyle, type IconStyle } from './utils/icons.js';
import { setSoundConfig } from './utils/sound.js';
import type { LLMProvider } from './providers/types.js';

async function main() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  const flags: Record<string, string> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : 'true';
      flags[key] = value;
    } else if (arg.startsWith('-')) {
      const key = arg.slice(1);
      const value = args[i + 1] && !args[i + 1].startsWith('-') ? args[++i] : 'true';
      flags[key] = value;
    }
  }

  // Handle help
  if (flags.help || flags.h) {
    console.log(`
argo · your open-source AI companion

Usage: argo [options]

Options:
  --provider, -p    Provider type: 'ollama' or 'openai' (default: openai-compatible)
  --model, -m       Model to use
  --url, -u         Base URL for the provider
  --api-key, -k     API key for OpenAI-compatible providers
  --icons, -i       Icon style: 'nerd', 'unicode', or 'ascii' (default: nerd)
  --vim             Enable vim keybindings
  --no-sound        Disable sound notifications
  --resume, -r      Open the conversation picker on launch
  --help, -h        Show this help message

Keyboard Shortcuts:
  Ctrl+P            Command palette
  Ctrl+O            Session picker
  Ctrl+S            Skills & agents
  Ctrl+R            Providers (switch / add)
  Ctrl+L            Clear conversation
  Ctrl+K            Copy last code block
  Ctrl+C            Abort request / Exit
  Tab               Toggle thinking panel

Bash mode:
  !cmd              Run cmd in active shell session
  !ssh user@host    Open a persistent SSH session — argo's tools run on it too
  !exit             Close active session, return to local
  !sessions         List active sessions

Commands (type in input):
  /help             Show available commands
  /clear            Clear conversation
  /export           Export to markdown
  /copy             Copy last code block
  /session          Manage sessions
  /providers        Manage LLM providers
  /soul             View or reset Argo's evolving personality
  /mcp              List active MCP servers
  /tokens           Show token usage

@mentions:
  Type @path/to/file in any message to attach the file's contents.
  Examples: @src/app.tsx, @./README.md, @~/notes.md

MCP (Model Context Protocol):
  Configure servers in ~/.argo/mcp.yaml — they spawn at startup
  and their tools auto-register as mcp__<server>__<tool>.

Configuration:
  Config file: ~/.argo/config.yaml

Tip:
  Argo uses your current shell directory as its workspace.
  Run \`argo\` in any project to scope it there.
  Install globally: \`npm install -g .\` from the argo source dir.
`);
    process.exit(0);
  }

  // Load config
  const config = await loadConfig();

  // Set icon style
  const iconStyle = (flags.icons || flags.i || config.ui?.icons || 'nerd') as IconStyle;
  setIconStyle(iconStyle);

  // Set sound config
  const soundEnabled = flags['no-sound'] !== 'true';
  setSoundConfig({ enabled: soundEnabled });

  // Parse other options
  const vimMode = flags.vim === 'true';
  const resumeMode = flags.resume === 'true' || flags.r === 'true';

  // Resolve provider:
  //   1. CLI flags override everything
  //   2. Otherwise use ~/.argo/providers.yaml active provider
  //   3. Falls back to legacy config.yaml provider block
  const cliProviderType = flags.provider || flags.p;
  const cliModel = flags.model || flags.m;
  const cliUrl = flags.url || flags.u;
  const cliKey = flags['api-key'] || flags.k;

  let provider: LLMProvider;
  let providerLabel: string;
  let model: string;

  if (cliProviderType || cliUrl) {
    const t = cliProviderType || config.provider.type;
    model = cliModel || config.provider.model || 'llama3.2';
    const baseUrl = cliUrl || config.provider.baseUrl;
    const apiKey = cliKey || config.provider.apiKey;
    provider = t === 'openai' || t === 'openai-compatible'
      ? new OpenAICompatProvider({ baseUrl, apiKey, model })
      : new OllamaProvider({ baseUrl, apiKey, model });
    providerLabel = t === 'ollama' ? 'Ollama' : 'OpenAI-compat';
  } else {
    const active = await getActiveConfig();
    if (active) {
      provider = buildProvider(active);
      providerLabel = active.label;
      model = active.defaultModel || cliModel || 'llama3.2';
    } else {
      const t = config.provider.type;
      model = cliModel || config.provider.model || 'llama3.2';
      provider = t === 'openai-compatible'
        ? new OpenAICompatProvider({ baseUrl: config.provider.baseUrl, apiKey: config.provider.apiKey, model })
        : new OllamaProvider({ baseUrl: config.provider.baseUrl, model });
      providerLabel = t === 'ollama' ? 'Ollama' : 'OpenAI-compat';
    }
  }

  // Start the app
  console.clear();
  const { waitUntilExit } = render(
    <App
      provider={provider}
      providerName={providerLabel}
      modelName={model}
      systemPrompt={config.systemPrompt}
      vimMode={vimMode}
      soundEnabled={soundEnabled}
      resumeOnLaunch={resumeMode}
    />
  );

  await waitUntilExit();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

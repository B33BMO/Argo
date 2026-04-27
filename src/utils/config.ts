import { readFile, writeFile, mkdir } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';
import YAML from 'yaml';

export interface RooConfig {
  provider: {
    type: 'ollama' | 'openai-compatible';
    baseUrl?: string;
    apiKey?: string;
    model?: string;
  };
  confirmations: {
    bash: 'always' | 'never' | 'destructive';
    write_file: 'always' | 'never' | 'new_only';
    edit_file: 'always' | 'never';
    curl: 'always' | 'never' | 'non_get';
  };
  ui: {
    icons: 'nerd' | 'unicode' | 'ascii';
    theme: string;
  };
  systemPrompt?: string;
}

const DEFAULT_CONFIG: RooConfig = {
  provider: {
    type: 'openai-compatible',
    baseUrl: 'https://llama.coleman-it.com/v1',
    model: 'unsloth/Qwen3.5-122B-A10B-GGUF:Q4_K_M',
  },
  confirmations: {
    bash: 'destructive',
    write_file: 'new_only',
    edit_file: 'never',
    curl: 'non_get',
  },
  ui: {
    icons: 'nerd',
    theme: 'default',
  },
};

export function getConfigDir(): string {
  return join(homedir(), '.roo');
}

export function getConfigPath(): string {
  return join(getConfigDir(), 'config.yaml');
}

export async function loadConfig(): Promise<RooConfig> {
  try {
    const configPath = getConfigPath();
    const content = await readFile(configPath, 'utf-8');
    const userConfig = YAML.parse(content);
    return { ...DEFAULT_CONFIG, ...userConfig };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export async function saveConfig(config: RooConfig): Promise<void> {
  const configDir = getConfigDir();
  await mkdir(configDir, { recursive: true });

  const configPath = getConfigPath();
  const content = YAML.stringify(config);
  await writeFile(configPath, content, 'utf-8');
}

export async function initConfig(): Promise<RooConfig> {
  const configPath = getConfigPath();

  try {
    await readFile(configPath, 'utf-8');
    return loadConfig();
  } catch {
    // Config doesn't exist, create default
    await saveConfig(DEFAULT_CONFIG);
    return DEFAULT_CONFIG;
  }
}

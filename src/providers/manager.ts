// Provider configuration management — multiple endpoints, hot-swap support
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import YAML from 'yaml';
import { OllamaProvider } from './ollama.js';
import { OpenAICompatProvider } from './openai-compat.js';
import type { LLMProvider } from './types.js';

export type ProviderType = 'ollama' | 'openai-compatible';

export interface ProviderConfig {
  id: string;
  label: string;
  type: ProviderType;
  baseUrl: string;
  apiKey?: string;
  defaultModel?: string;
}

const PROVIDERS_FILE = path.join(os.homedir(), '.argo', 'providers.yaml');

// Built-in presets — users can pick one and just paste their API key
export const BUILTIN_PRESETS: ProviderConfig[] = [
  {
    id: 'ollama-local',
    label: 'Ollama (local)',
    type: 'ollama',
    baseUrl: 'http://localhost:11434',
    defaultModel: 'llama3.2',
  },
  {
    id: 'ollama-cloud',
    label: 'Ollama Cloud',
    type: 'ollama',
    baseUrl: 'https://ollama.com',
    defaultModel: 'gpt-oss:120b',
  },
  {
    id: 'llama-coleman',
    label: 'llama.cpp · coleman-it',
    type: 'openai-compatible',
    baseUrl: 'https://llama.coleman-it.com/v1',
    defaultModel: 'unsloth/Qwen3.5-122B-A10B-GGUF:Q4_K_M',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    type: 'openai-compatible',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
  },
  {
    id: 'groq',
    label: 'Groq',
    type: 'openai-compatible',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
  },
  {
    id: 'together',
    label: 'Together AI',
    type: 'openai-compatible',
    baseUrl: 'https://api.together.xyz/v1',
    defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
  },
];

interface ProvidersFile {
  active: string; // id of active provider
  providers: ProviderConfig[];
}

async function ensureDir(): Promise<void> {
  await fs.mkdir(path.dirname(PROVIDERS_FILE), { recursive: true });
}

export async function loadProviders(): Promise<ProvidersFile> {
  try {
    const content = await fs.readFile(PROVIDERS_FILE, 'utf-8');
    const parsed = YAML.parse(content) as ProvidersFile;
    if (parsed && Array.isArray(parsed.providers)) return parsed;
  } catch {
    // Fall through to default
  }

  // First run — seed with the active config from the legacy config.yaml
  return {
    active: 'llama-coleman',
    providers: [BUILTIN_PRESETS[2]], // llama.cpp coleman default
  };
}

export async function saveProviders(file: ProvidersFile): Promise<void> {
  await ensureDir();
  await fs.writeFile(PROVIDERS_FILE, YAML.stringify(file), 'utf-8');
}

export async function addProvider(config: ProviderConfig): Promise<void> {
  const file = await loadProviders();
  // Replace if id already exists, else append
  const idx = file.providers.findIndex(p => p.id === config.id);
  if (idx >= 0) {
    file.providers[idx] = config;
  } else {
    file.providers.push(config);
  }
  await saveProviders(file);
}

export async function removeProvider(id: string): Promise<void> {
  const file = await loadProviders();
  file.providers = file.providers.filter(p => p.id !== id);
  if (file.active === id && file.providers.length > 0) {
    file.active = file.providers[0].id;
  }
  await saveProviders(file);
}

export async function setActiveProvider(id: string): Promise<void> {
  const file = await loadProviders();
  if (file.providers.find(p => p.id === id)) {
    file.active = id;
    await saveProviders(file);
  }
}

export async function getActiveConfig(): Promise<ProviderConfig | null> {
  const file = await loadProviders();
  return file.providers.find(p => p.id === file.active) || file.providers[0] || null;
}

// Build a live LLMProvider instance from a stored config
export function buildProvider(config: ProviderConfig): LLMProvider {
  if (config.type === 'ollama') {
    return new OllamaProvider({
      baseUrl: config.baseUrl,
      model: config.defaultModel,
      apiKey: config.apiKey,
    });
  }
  return new OpenAICompatProvider({
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    model: config.defaultModel,
  });
}

// Generate a stable id from a label
export function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || `provider-${Date.now()}`;
}

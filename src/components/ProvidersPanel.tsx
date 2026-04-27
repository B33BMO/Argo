import React, { useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import {
  loadProviders,
  saveProviders,
  addProvider,
  removeProvider,
  setActiveProvider,
  BUILTIN_PRESETS,
  slugify,
  type ProviderConfig,
  type ProviderType,
} from '../providers/manager.js';

interface ProvidersPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onSwitch: (config: ProviderConfig) => void;
}

type View = 'list' | 'presets' | 'form';

export function ProvidersPanel({ isOpen, onClose, onSwitch }: ProvidersPanelProps) {
  const [view, setView] = useState<View>('list');
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [activeId, setActiveId] = useState<string>('');
  const [selectedIdx, setSelectedIdx] = useState(0);

  // Form state for adding/editing
  const [formField, setFormField] = useState<'label' | 'baseUrl' | 'apiKey' | 'model' | 'type' | 'submit'>('label');
  const [form, setForm] = useState<{
    label: string;
    baseUrl: string;
    apiKey: string;
    defaultModel: string;
    type: ProviderType;
  }>({ label: '', baseUrl: '', apiKey: '', defaultModel: '', type: 'openai-compatible' });

  const refresh = async () => {
    const f = await loadProviders();
    setProviders(f.providers);
    setActiveId(f.active);
  };

  useEffect(() => {
    if (isOpen) {
      refresh();
      setView('list');
      setSelectedIdx(0);
    }
  }, [isOpen]);

  useInput((input, key) => {
    if (!isOpen) return;

    if (key.escape) {
      if (view === 'list') {
        onClose();
      } else {
        setView('list');
      }
      return;
    }

    // ===== LIST VIEW =====
    if (view === 'list') {
      if (key.upArrow || input === 'k') {
        setSelectedIdx(i => Math.max(0, i - 1));
        return;
      }
      if (key.downArrow || input === 'j') {
        setSelectedIdx(i => Math.min(providers.length - 1, i + 1));
        return;
      }
      if (key.return && providers[selectedIdx]) {
        const cfg = providers[selectedIdx];
        setActiveProvider(cfg.id).then(() => {
          setActiveId(cfg.id);
          onSwitch(cfg);
          onClose();
        });
        return;
      }
      if (input === 'a') {
        setView('presets');
        setSelectedIdx(0);
        return;
      }
      if (input === 'n') {
        setForm({ label: '', baseUrl: '', apiKey: '', defaultModel: '', type: 'openai-compatible' });
        setFormField('label');
        setView('form');
        return;
      }
      if (input === 'd' && providers[selectedIdx]) {
        const id = providers[selectedIdx].id;
        removeProvider(id).then(refresh);
        return;
      }
      return;
    }

    // ===== PRESETS VIEW =====
    if (view === 'presets') {
      if (key.upArrow || input === 'k') {
        setSelectedIdx(i => Math.max(0, i - 1));
        return;
      }
      if (key.downArrow || input === 'j') {
        setSelectedIdx(i => Math.min(BUILTIN_PRESETS.length - 1, i + 1));
        return;
      }
      if (key.return) {
        const preset = BUILTIN_PRESETS[selectedIdx];
        // For Ollama local, no key needed — add directly
        const needsKey = preset.id !== 'ollama-local';
        if (!needsKey) {
          addProvider(preset).then(refresh).then(() => setView('list'));
        } else {
          setForm({
            label: preset.label,
            baseUrl: preset.baseUrl,
            apiKey: '',
            defaultModel: preset.defaultModel || '',
            type: preset.type,
          });
          setFormField('apiKey');
          setView('form');
        }
        return;
      }
      return;
    }

    // ===== FORM VIEW =====
    if (view === 'form') {
      if (key.tab || (key.return && formField !== 'submit')) {
        const order: typeof formField[] = ['label', 'type', 'baseUrl', 'apiKey', 'model', 'submit'];
        const idx = order.indexOf(formField);
        setFormField(order[(idx + 1) % order.length]);
        return;
      }

      if (formField === 'type') {
        if (input === ' ' || key.leftArrow || key.rightArrow) {
          setForm(f => ({ ...f, type: f.type === 'ollama' ? 'openai-compatible' : 'ollama' }));
        }
        return;
      }

      if (formField === 'submit' && key.return) {
        if (form.label && form.baseUrl) {
          const cfg: ProviderConfig = {
            id: slugify(form.label),
            label: form.label,
            type: form.type,
            baseUrl: form.baseUrl,
            apiKey: form.apiKey || undefined,
            defaultModel: form.defaultModel || undefined,
          };
          addProvider(cfg).then(refresh).then(() => setView('list'));
        }
        return;
      }

      // Text input
      if (key.backspace || key.delete) {
        const map: Record<string, keyof typeof form> = {
          label: 'label', baseUrl: 'baseUrl', apiKey: 'apiKey', model: 'defaultModel',
        };
        const k = map[formField];
        if (k) setForm(f => ({ ...f, [k]: (f[k] as string).slice(0, -1) }));
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        const map: Record<string, keyof typeof form> = {
          label: 'label', baseUrl: 'baseUrl', apiKey: 'apiKey', model: 'defaultModel',
        };
        const k = map[formField];
        if (k) setForm(f => ({ ...f, [k]: (f[k] as string) + input }));
      }
    }
  }, { isActive: isOpen });

  if (!isOpen) return null;

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" padding={1} marginY={1}>
      <Box marginBottom={1}>
        <Text color="cyan" bold>● providers</Text>
        <Text color="gray" dimColor>
          {' '}· {view === 'list' ? 'configured' : view === 'presets' ? 'add from preset' : 'custom provider'}
        </Text>
      </Box>

      {view === 'list' && (
        <Box flexDirection="column">
          {providers.length === 0 ? (
            <Text color="gray" dimColor>No providers configured. Press 'a' to add a preset.</Text>
          ) : (
            providers.map((p, i) => (
              <Box key={p.id}>
                <Text color={i === selectedIdx ? 'cyan' : 'white'}>
                  {i === selectedIdx ? '› ' : '  '}
                </Text>
                <Text color={p.id === activeId ? 'green' : 'gray'}>
                  {p.id === activeId ? '● ' : '○ '}
                </Text>
                <Text color={i === selectedIdx ? 'cyan' : 'white'} bold={i === selectedIdx}>
                  {p.label}
                </Text>
                <Text color="gray" dimColor>
                  {' '}· {p.type} · {p.baseUrl}
                </Text>
              </Box>
            ))
          )}
          <Box marginTop={1}>
            <Text color="gray" dimColor>
              ↑↓ nav · Enter switch · a presets · n new · d delete · Esc close
            </Text>
          </Box>
        </Box>
      )}

      {view === 'presets' && (
        <Box flexDirection="column">
          {BUILTIN_PRESETS.map((p, i) => (
            <Box key={p.id}>
              <Text color={i === selectedIdx ? 'cyan' : 'white'}>
                {i === selectedIdx ? '› ' : '  '}
              </Text>
              <Text color={i === selectedIdx ? 'cyan' : 'white'} bold={i === selectedIdx}>
                {p.label}
              </Text>
              <Text color="gray" dimColor>
                {' '}· {p.baseUrl}
              </Text>
            </Box>
          ))}
          <Box marginTop={1}>
            <Text color="gray" dimColor>↑↓ nav · Enter add · Esc back</Text>
          </Box>
        </Box>
      )}

      {view === 'form' && (
        <Box flexDirection="column">
          <FormRow label="label   " value={form.label} active={formField === 'label'} />
          <Box>
            <Text color={formField === 'type' ? 'cyan' : 'gray'}>
              {formField === 'type' ? '› ' : '  '}type
            </Text>
            <Text color="white">{form.type}</Text>
            {formField === 'type' && (
              <Text color="gray" dimColor> (←/→ to toggle)</Text>
            )}
          </Box>
          <FormRow label="baseUrl " value={form.baseUrl} active={formField === 'baseUrl'} />
          <FormRow label="apiKey  " value={form.apiKey ? '•'.repeat(form.apiKey.length) : ''} active={formField === 'apiKey'} />
          <FormRow label="model   " value={form.defaultModel} active={formField === 'model'} />
          <Box marginTop={1}>
            <Text color={formField === 'submit' ? 'green' : 'gray'} bold={formField === 'submit'}>
              {formField === 'submit' ? '› ' : '  '}[ save ]
            </Text>
          </Box>
          <Box marginTop={1}>
            <Text color="gray" dimColor>Tab next · Enter submit (on save) · Esc cancel</Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}

function FormRow({ label, value, active }: { label: string; value: string; active: boolean }) {
  return (
    <Box>
      <Text color={active ? 'cyan' : 'gray'}>
        {active ? '› ' : '  '}{label}
      </Text>
      <Text color="white">{value}</Text>
      {active && <Text color="cyan">▎</Text>}
    </Box>
  );
}

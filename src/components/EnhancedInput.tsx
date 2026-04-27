import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import { icon } from '../utils/icons.js';
import { useVimMode, getModeIndicator, type VimMode } from '../hooks/useVimMode.js';
import { getCompletions, type CompletionItem } from '../utils/autocomplete.js';
import { AutocompleteDropdown } from './CommandPalette.js';

interface EnhancedInputProps {
  onSubmit: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  vimMode?: boolean;
  showCompletions?: boolean;
  cwd?: string;
  historyItems?: string[];
}

export function EnhancedInput({
  onSubmit,
  placeholder = 'Type a message...',
  disabled = false,
  vimMode: vimModeEnabled = false,
  showCompletions = true,
  cwd = process.cwd(),
  historyItems = [],
}: EnhancedInputProps) {
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [completions, setCompletions] = useState<CompletionItem[]>([]);
  const [completionIndex, setCompletionIndex] = useState(0);
  const [showAutocomplete, setShowAutocomplete] = useState(false);

  const handleSubmit = useCallback((value: string) => {
    if (value.trim()) {
      onSubmit(value);
      vim.reset();
      setHistoryIndex(-1);
      setShowAutocomplete(false);
    }
  }, [onSubmit]);

  const vim = useVimMode({
    enabled: vimModeEnabled,
    onSubmit: handleSubmit,
  });

  // Update completions when value changes
  useEffect(() => {
    if (!showCompletions || !vim.value) {
      setCompletions([]);
      setShowAutocomplete(false);
      return;
    }

    const timer = setTimeout(async () => {
      const items = await getCompletions(vim.value, vim.cursor, cwd);
      setCompletions(items);
      setCompletionIndex(0);
      setShowAutocomplete(items.length > 0);
    }, 150);

    return () => clearTimeout(timer);
  }, [vim.value, vim.cursor, cwd, showCompletions]);

  useInput((input, key) => {
    if (disabled) return;

    // Handle Tab for completion
    if (key.tab && showAutocomplete && completions.length > 0) {
      const selected = completions[completionIndex];
      if (selected) {
        // Find the part to replace
        const words = vim.value.split(/\s+/);
        const lastWord = words[words.length - 1];
        const newValue = vim.value.slice(0, vim.value.length - lastWord.length) + selected.value;
        vim.setValue(newValue);
        setShowAutocomplete(false);
      }
      return;
    }

    // Navigate completions
    if (showAutocomplete && completions.length > 0) {
      if (key.downArrow && !vimModeEnabled) {
        setCompletionIndex(i => Math.min(completions.length - 1, i + 1));
        return;
      }
      if (key.upArrow && !vimModeEnabled) {
        setCompletionIndex(i => Math.max(0, i - 1));
        return;
      }
    }

    // History navigation
    if (historyItems.length > 0 && !vimModeEnabled) {
      if (key.upArrow) {
        const newIndex = Math.min(historyIndex + 1, historyItems.length - 1);
        setHistoryIndex(newIndex);
        vim.setValue(historyItems[newIndex] || '');
        return;
      }
      if (key.downArrow) {
        const newIndex = Math.max(historyIndex - 1, -1);
        setHistoryIndex(newIndex);
        vim.setValue(newIndex >= 0 ? historyItems[newIndex] : '');
        return;
      }
    }

    // Escape closes autocomplete
    if (key.escape && showAutocomplete) {
      setShowAutocomplete(false);
      return;
    }

    // Ctrl+C to clear
    if (key.ctrl && input === 'c' && vim.value) {
      vim.reset();
      setShowAutocomplete(false);
      return;
    }

    // Pass to vim handler
    vim.handleKey(input, key);
  }, { isActive: !disabled });

  const isEmpty = vim.value.length === 0;
  const modeIndicator = vimModeEnabled ? getModeIndicator(vim.mode) : null;

  return (
    <Box flexDirection="column">
      {/* Main input line */}
      <Box>
        {/* Vim mode indicator */}
        {modeIndicator && (
          <Box marginRight={1}>
            <Text color={modeIndicator.color as any} bold>
              [{modeIndicator.label}]
            </Text>
          </Box>
        )}

        {/* Prompt */}
        <Text color={disabled ? 'gray' : 'cyan'}>
          {icon('chevronRight')}{' '}
        </Text>

        {/* Input area */}
        <Box flexGrow={1}>
          {isEmpty ? (
            <Text color="gray" dimColor>
              {placeholder}
            </Text>
          ) : (
            <InputWithCursor
              value={vim.value}
              cursor={vim.cursor}
              mode={vim.mode}
              disabled={disabled}
            />
          )}
        </Box>
      </Box>

      {/* Autocomplete dropdown */}
      {showAutocomplete && completions.length > 0 && (
        <Box marginLeft={vimModeEnabled ? 11 : 2}>
          <AutocompleteDropdown
            items={completions}
            selectedIndex={completionIndex}
            onSelect={(item) => {
              const words = vim.value.split(/\s+/);
              const lastWord = words[words.length - 1];
              const newValue = vim.value.slice(0, vim.value.length - lastWord.length) + item.value;
              vim.setValue(newValue);
              setShowAutocomplete(false);
            }}
            maxItems={5}
          />
        </Box>
      )}
    </Box>
  );
}

interface InputWithCursorProps {
  value: string;
  cursor: number;
  mode: VimMode;
  disabled: boolean;
}

function InputWithCursor({ value, cursor, mode, disabled }: InputWithCursorProps) {
  const [cursorVisible, setCursorVisible] = useState(true);

  // Blink cursor in insert mode
  useEffect(() => {
    if (mode !== 'insert') {
      setCursorVisible(true);
      return;
    }

    const timer = setInterval(() => {
      setCursorVisible(v => !v);
    }, 530);

    return () => clearInterval(timer);
  }, [mode]);

  const beforeCursor = value.slice(0, cursor);
  const atCursor = value[cursor] || ' ';
  const afterCursor = value.slice(cursor + 1);

  // Different cursor styles for different modes
  const cursorStyle = mode === 'normal' ? 'block' : 'line';

  return (
    <Box>
      <Text color={disabled ? 'gray' : 'white'}>{beforeCursor}</Text>
      {cursorStyle === 'block' ? (
        <Text backgroundColor="white" color="black">
          {atCursor}
        </Text>
      ) : (
        <>
          {cursorVisible && <Text color="cyan">▎</Text>}
          <Text color={disabled ? 'gray' : 'white'}>{atCursor}</Text>
        </>
      )}
      <Text color={disabled ? 'gray' : 'white'}>{afterCursor}</Text>
    </Box>
  );
}

// Simple input for backward compatibility
interface SimpleInputProps {
  onSubmit: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function SimpleInput({ onSubmit, placeholder, disabled }: SimpleInputProps) {
  return (
    <EnhancedInput
      onSubmit={onSubmit}
      placeholder={placeholder}
      disabled={disabled}
      vimMode={false}
      showCompletions={false}
    />
  );
}

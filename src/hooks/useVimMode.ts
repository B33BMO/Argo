// Vim-style keybindings for input
import { useState, useCallback, useRef } from 'react';

export type VimMode = 'normal' | 'insert' | 'visual' | 'command';

interface VimState {
  mode: VimMode;
  cursor: number;
  visualStart?: number;
  register: string; // Clipboard/yank register
  lastCommand: string;
  count: number; // For repeat commands like 3w
}

interface UseVimModeOptions {
  enabled?: boolean;
  initialValue?: string;
  onSubmit?: (value: string) => void;
  onChange?: (value: string) => void;
}

interface VimActions {
  value: string;
  cursor: number;
  mode: VimMode;
  handleKey: (input: string, key: KeyInfo) => void;
  setValue: (value: string) => void;
  reset: () => void;
}

interface KeyInfo {
  return?: boolean;
  escape?: boolean;
  backspace?: boolean;
  delete?: boolean;
  upArrow?: boolean;
  downArrow?: boolean;
  leftArrow?: boolean;
  rightArrow?: boolean;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  tab?: boolean;
}

export function useVimMode({
  enabled = true,
  initialValue = '',
  onSubmit,
  onChange,
}: UseVimModeOptions): VimActions {
  const [value, setValueInternal] = useState(initialValue);
  const [state, setState] = useState<VimState>({
    mode: enabled ? 'normal' : 'insert',
    cursor: 0,
    register: '',
    lastCommand: '',
    count: 0,
  });

  const pendingKeys = useRef('');

  const setValue = useCallback((newValue: string) => {
    setValueInternal(newValue);
    onChange?.(newValue);
  }, [onChange]);

  const moveCursor = useCallback((delta: number) => {
    setState(s => ({
      ...s,
      cursor: Math.max(0, Math.min(value.length, s.cursor + delta)),
    }));
  }, [value.length]);

  const setMode = useCallback((mode: VimMode) => {
    setState(s => ({ ...s, mode }));
    pendingKeys.current = '';
  }, []);

  // Word movement helpers
  const findNextWord = useCallback((pos: number): number => {
    const text = value;
    let i = pos;
    // Skip current word
    while (i < text.length && /\w/.test(text[i])) i++;
    // Skip whitespace
    while (i < text.length && /\s/.test(text[i])) i++;
    return i;
  }, [value]);

  const findPrevWord = useCallback((pos: number): number => {
    const text = value;
    let i = pos - 1;
    // Skip whitespace
    while (i > 0 && /\s/.test(text[i])) i--;
    // Skip word
    while (i > 0 && /\w/.test(text[i - 1])) i--;
    return Math.max(0, i);
  }, [value]);

  const findEndOfWord = useCallback((pos: number): number => {
    const text = value;
    let i = pos + 1;
    // Skip whitespace
    while (i < text.length && /\s/.test(text[i])) i++;
    // Find end of word
    while (i < text.length && /\w/.test(text[i])) i++;
    return Math.min(text.length, i);
  }, [value]);

  // Delete operations
  const deleteRange = useCallback((start: number, end: number) => {
    const deleted = value.slice(start, end);
    const newValue = value.slice(0, start) + value.slice(end);
    setValue(newValue);
    setState(s => ({
      ...s,
      register: deleted,
      cursor: Math.min(start, newValue.length),
    }));
  }, [value, setValue]);

  const handleNormalMode = useCallback((input: string, key: KeyInfo) => {
    const pending = pendingKeys.current + input;

    // Handle count prefix (e.g., 3w)
    if (/^\d$/.test(input) && !pendingKeys.current) {
      setState(s => ({ ...s, count: s.count * 10 + parseInt(input) }));
      return;
    }

    const count = state.count || 1;
    const resetCount = () => setState(s => ({ ...s, count: 0 }));

    // Movement commands
    switch (pending) {
      case 'h':
      case '':
        for (let i = 0; i < count; i++) moveCursor(-1);
        resetCount();
        pendingKeys.current = '';
        return;

      case 'l':
      case ' ':
        for (let i = 0; i < count; i++) moveCursor(1);
        resetCount();
        pendingKeys.current = '';
        return;

      case 'w':
        let pos = state.cursor;
        for (let i = 0; i < count; i++) pos = findNextWord(pos);
        setState(s => ({ ...s, cursor: pos, count: 0 }));
        pendingKeys.current = '';
        return;

      case 'b':
        let bpos = state.cursor;
        for (let i = 0; i < count; i++) bpos = findPrevWord(bpos);
        setState(s => ({ ...s, cursor: bpos, count: 0 }));
        pendingKeys.current = '';
        return;

      case 'e':
        let epos = state.cursor;
        for (let i = 0; i < count; i++) epos = findEndOfWord(epos);
        setState(s => ({ ...s, cursor: epos, count: 0 }));
        pendingKeys.current = '';
        return;

      case '0':
      case '^':
        setState(s => ({ ...s, cursor: 0, count: 0 }));
        pendingKeys.current = '';
        return;

      case '$':
        setState(s => ({ ...s, cursor: value.length, count: 0 }));
        pendingKeys.current = '';
        return;

      // Mode switching
      case 'i':
        setMode('insert');
        resetCount();
        return;

      case 'I':
        setState(s => ({ ...s, cursor: 0 }));
        setMode('insert');
        resetCount();
        return;

      case 'a':
        moveCursor(1);
        setMode('insert');
        resetCount();
        return;

      case 'A':
        setState(s => ({ ...s, cursor: value.length }));
        setMode('insert');
        resetCount();
        return;

      case 'o':
      case 'O':
        setState(s => ({ ...s, cursor: value.length }));
        setMode('insert');
        resetCount();
        return;

      // Delete operations
      case 'x':
        for (let i = 0; i < count; i++) {
          if (state.cursor < value.length) {
            deleteRange(state.cursor, state.cursor + 1);
          }
        }
        resetCount();
        pendingKeys.current = '';
        return;

      case 'X':
        for (let i = 0; i < count; i++) {
          if (state.cursor > 0) {
            deleteRange(state.cursor - 1, state.cursor);
          }
        }
        resetCount();
        pendingKeys.current = '';
        return;

      case 'dd':
        setState(s => ({ ...s, register: value }));
        setValue('');
        setState(s => ({ ...s, cursor: 0, count: 0 }));
        pendingKeys.current = '';
        return;

      case 'D':
        deleteRange(state.cursor, value.length);
        resetCount();
        pendingKeys.current = '';
        return;

      case 'dw':
        const dwEnd = findNextWord(state.cursor);
        deleteRange(state.cursor, dwEnd);
        resetCount();
        pendingKeys.current = '';
        return;

      case 'db':
        const dbStart = findPrevWord(state.cursor);
        deleteRange(dbStart, state.cursor);
        resetCount();
        pendingKeys.current = '';
        return;

      case 'd$':
        deleteRange(state.cursor, value.length);
        resetCount();
        pendingKeys.current = '';
        return;

      case 'd0':
        deleteRange(0, state.cursor);
        resetCount();
        pendingKeys.current = '';
        return;

      // Change operations
      case 'cc':
      case 'S':
        setState(s => ({ ...s, register: value }));
        setValue('');
        setState(s => ({ ...s, cursor: 0, count: 0 }));
        setMode('insert');
        return;

      case 'C':
        deleteRange(state.cursor, value.length);
        setMode('insert');
        resetCount();
        pendingKeys.current = '';
        return;

      case 'cw':
        const cwEnd = findEndOfWord(state.cursor);
        deleteRange(state.cursor, cwEnd);
        setMode('insert');
        resetCount();
        pendingKeys.current = '';
        return;

      // Yank and paste
      case 'yy':
      case 'Y':
        setState(s => ({ ...s, register: value, count: 0 }));
        pendingKeys.current = '';
        return;

      case 'yw':
        const ywEnd = findNextWord(state.cursor);
        setState(s => ({ ...s, register: value.slice(s.cursor, ywEnd), count: 0 }));
        pendingKeys.current = '';
        return;

      case 'p':
        const afterCursor = value.slice(0, state.cursor + 1) + state.register + value.slice(state.cursor + 1);
        setValue(afterCursor);
        setState(s => ({ ...s, cursor: s.cursor + 1, count: 0 }));
        pendingKeys.current = '';
        return;

      case 'P':
        const beforeCursor = value.slice(0, state.cursor) + state.register + value.slice(state.cursor);
        setValue(beforeCursor);
        resetCount();
        pendingKeys.current = '';
        return;

      // Undo (simplified - just clear)
      case 'u':
        setValue('');
        setState(s => ({ ...s, cursor: 0, count: 0 }));
        pendingKeys.current = '';
        return;
    }

    // Handle escape
    if (key.escape) {
      pendingKeys.current = '';
      resetCount();
      return;
    }

    // Wait for more input for multi-char commands
    if (pending === 'd' || pending === 'c' || pending === 'y') {
      pendingKeys.current = pending;
      return;
    }

    // Unknown command, reset
    pendingKeys.current = '';
    resetCount();
  }, [state, value, moveCursor, setMode, deleteRange, setValue, findNextWord, findPrevWord, findEndOfWord]);

  const handleInsertMode = useCallback((input: string, key: KeyInfo) => {
    if (key.escape) {
      setMode('normal');
      if (state.cursor > 0) moveCursor(-1);
      return;
    }

    if (key.return) {
      onSubmit?.(value);
      return;
    }

    if (key.backspace) {
      if (state.cursor > 0) {
        const newValue = value.slice(0, state.cursor - 1) + value.slice(state.cursor);
        setValue(newValue);
        moveCursor(-1);
      }
      return;
    }

    if (key.delete) {
      if (state.cursor < value.length) {
        const newValue = value.slice(0, state.cursor) + value.slice(state.cursor + 1);
        setValue(newValue);
      }
      return;
    }

    if (key.leftArrow) {
      moveCursor(-1);
      return;
    }

    if (key.rightArrow) {
      moveCursor(1);
      return;
    }

    // Regular character input
    if (input && !key.ctrl && !key.meta) {
      const newValue = value.slice(0, state.cursor) + input + value.slice(state.cursor);
      setValue(newValue);
      moveCursor(input.length);
    }
  }, [state, value, setValue, moveCursor, setMode, onSubmit]);

  const handleKey = useCallback((input: string, key: KeyInfo) => {
    if (!enabled) {
      // Non-vim mode: simple insert behavior
      handleInsertMode(input, key);
      return;
    }

    switch (state.mode) {
      case 'normal':
        handleNormalMode(input, key);
        break;
      case 'insert':
        handleInsertMode(input, key);
        break;
    }
  }, [enabled, state.mode, handleNormalMode, handleInsertMode]);

  const reset = useCallback(() => {
    setValueInternal('');
    setState({
      mode: enabled ? 'normal' : 'insert',
      cursor: 0,
      register: '',
      lastCommand: '',
      count: 0,
    });
    pendingKeys.current = '';
  }, [enabled]);

  return {
    value,
    cursor: state.cursor,
    mode: state.mode,
    handleKey,
    setValue,
    reset,
  };
}

// Mode indicator component helper
export function getModeIndicator(mode: VimMode): { label: string; color: string } {
  switch (mode) {
    case 'normal':
      return { label: 'NORMAL', color: 'blue' };
    case 'insert':
      return { label: 'INSERT', color: 'green' };
    case 'visual':
      return { label: 'VISUAL', color: 'magenta' };
    case 'command':
      return { label: 'COMMAND', color: 'yellow' };
    default:
      return { label: 'UNKNOWN', color: 'gray' };
  }
}

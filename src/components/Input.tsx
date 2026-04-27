import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';

interface InputProps {
  onSubmit: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function Input({ onSubmit, placeholder = '', disabled = false }: InputProps) {
  const [value, setValue] = useState('');
  const [cursorPosition, setCursorPosition] = useState(0);

  useInput(
    (input, key) => {
      if (disabled) return;

      if (key.return) {
        if (value.trim()) {
          onSubmit(value);
          setValue('');
          setCursorPosition(0);
        }
        return;
      }

      if (key.backspace || key.delete) {
        if (cursorPosition > 0) {
          setValue(
            value.slice(0, cursorPosition - 1) + value.slice(cursorPosition)
          );
          setCursorPosition(cursorPosition - 1);
        }
        return;
      }

      if (key.leftArrow) {
        setCursorPosition(Math.max(0, cursorPosition - 1));
        return;
      }

      if (key.rightArrow) {
        setCursorPosition(Math.min(value.length, cursorPosition + 1));
        return;
      }

      // Handle ctrl+a (beginning of line)
      if (key.ctrl && input === 'a') {
        setCursorPosition(0);
        return;
      }

      // Handle ctrl+e (end of line)
      if (key.ctrl && input === 'e') {
        setCursorPosition(value.length);
        return;
      }

      // Handle ctrl+u (clear line)
      if (key.ctrl && input === 'u') {
        setValue('');
        setCursorPosition(0);
        return;
      }

      // Handle ctrl+c (abort) - handled by app
      if (key.ctrl && input === 'c') {
        return;
      }

      // Regular character input
      if (input && !key.ctrl && !key.meta) {
        setValue(
          value.slice(0, cursorPosition) + input + value.slice(cursorPosition)
        );
        setCursorPosition(cursorPosition + input.length);
      }
    },
    { isActive: !disabled }
  );

  const displayValue = value || placeholder;
  const isPlaceholder = !value && placeholder;

  return (
    <Box>
      <Text color="cyan" bold>
        {'> '}
      </Text>
      <Text color={isPlaceholder ? 'gray' : undefined} dimColor={!!isPlaceholder}>
        {displayValue}
      </Text>
      {!disabled && (
        <Text backgroundColor="white" color="black">
          {' '}
        </Text>
      )}
    </Box>
  );
}

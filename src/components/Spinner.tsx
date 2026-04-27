import React, { memo } from 'react';
import { Text } from 'ink';
import { useAnimationTick } from '../hooks/useThrottledValue.js';

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

interface SpinnerProps {
  color?: string;
  active?: boolean;
  label?: string;
}

export const Spinner = memo(function Spinner({ color = 'cyan', active = true, label }: SpinnerProps) {
  const tick = useAnimationTick(active);
  const frame = FRAMES[tick % FRAMES.length];
  return (
    <Text color={color as any}>
      {frame}{label ? ` ${label}` : ''}
    </Text>
  );
});

interface ThinkingDotsProps {
  color?: string;
}

export const ThinkingDots = memo(function ThinkingDots({ color = 'gray' }: ThinkingDotsProps) {
  const tick = useAnimationTick(true);
  const dots = '.'.repeat((tick % 3) + 1).padEnd(3, ' ');
  return <Text color={color as any}>{dots}</Text>;
});

import React, { useState, useEffect } from 'react';
import { Text, Box } from 'ink';

// Different spinner animation styles
const SPINNERS = {
  dots: {
    frames: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
    interval: 80,
  },
  braille: {
    frames: ['⣾', '⣽', '⣻', '⢿', '⡿', '⣟', '⣯', '⣷'],
    interval: 100,
  },
  arrows: {
    frames: ['←', '↖', '↑', '↗', '→', '↘', '↓', '↙'],
    interval: 120,
  },
  bounce: {
    frames: ['⠁', '⠂', '⠄', '⡀', '⢀', '⠠', '⠐', '⠈'],
    interval: 100,
  },
  pulse: {
    frames: ['◜', '◠', '◝', '◞', '◡', '◟'],
    interval: 100,
  },
  thinking: {
    frames: ['🧠', '🧠', '🧠', '💭', '💭', '🧠'],
    interval: 300,
  },
  blocks: {
    frames: ['▖', '▘', '▝', '▗'],
    interval: 100,
  },
  wave: {
    frames: ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█', '▇', '▆', '▅', '▄', '▃', '▂'],
    interval: 80,
  },
};

export type SpinnerStyle = keyof typeof SPINNERS;

interface AnimatedSpinnerProps {
  label?: string;
  style?: SpinnerStyle;
  color?: string;
}

export function AnimatedSpinner({
  label,
  style = 'dots',
  color = 'cyan',
}: AnimatedSpinnerProps) {
  const spinner = SPINNERS[style];
  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setFrameIndex((i) => (i + 1) % spinner.frames.length);
    }, spinner.interval);

    return () => clearInterval(timer);
  }, [spinner]);

  return (
    <Box>
      <Text color={color}>{spinner.frames[frameIndex]}</Text>
      {label && (
        <Text color={color}>
          {' '}
          {label}
        </Text>
      )}
    </Box>
  );
}

// Pulsing text effect
interface PulsingTextProps {
  children: string;
  colors?: string[];
  interval?: number;
}

export function PulsingText({
  children,
  colors = ['cyan', 'blue', 'magenta', 'blue'],
  interval = 500,
}: PulsingTextProps) {
  const [colorIndex, setColorIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setColorIndex((i) => (i + 1) % colors.length);
    }, interval);

    return () => clearInterval(timer);
  }, [colors, interval]);

  return <Text color={colors[colorIndex]}>{children}</Text>;
}

// Typing cursor
interface TypingCursorProps {
  color?: string;
}

export function TypingCursor({ color = 'green' }: TypingCursorProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setInterval(() => {
      setVisible((v) => !v);
    }, 530);

    return () => clearInterval(timer);
  }, []);

  return <Text color={color}>{visible ? '█' : ' '}</Text>;
}

// Progress bar
interface ProgressBarProps {
  progress: number; // 0-100
  width?: number;
  color?: string;
  showPercent?: boolean;
}

export function ProgressBar({
  progress,
  width = 20,
  color = 'green',
  showPercent = true,
}: ProgressBarProps) {
  const filled = Math.round((progress / 100) * width);
  const empty = width - filled;

  return (
    <Box>
      <Text color={color}>
        {'█'.repeat(filled)}
        {'░'.repeat(empty)}
      </Text>
      {showPercent && (
        <Text color="gray"> {Math.round(progress)}%</Text>
      )}
    </Box>
  );
}

// Animated dots (for "Loading...")
interface AnimatedDotsProps {
  text?: string;
  color?: string;
}

export function AnimatedDots({ text = 'Loading', color = 'cyan' }: AnimatedDotsProps) {
  const [dots, setDots] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setDots((d) => (d + 1) % 4);
    }, 400);

    return () => clearInterval(timer);
  }, []);

  return (
    <Text color={color}>
      {text}{'.'.repeat(dots)}{' '.repeat(3 - dots)}
    </Text>
  );
}

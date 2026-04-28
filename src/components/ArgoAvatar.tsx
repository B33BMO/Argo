import React, { memo } from 'react';
import { Box, Text } from 'ink';

/**
 * Argo's avatar — a stylized ship prow / triangular sail mark.
 * Conveys: forward motion, exploration, the Argo ship's iconic shape.
 */

// Compact 3-line avatar for inline use (next to messages, in panels)
const AVATAR_SMALL = [
  '  ▲  ',
  ' ╱│╲ ',
  '╱─┴─╲',
];

// Larger 6-line avatar for the welcome screen
const AVATAR_LARGE = [
  '       ▲       ',
  '      ╱│╲      ',
  '     ╱ │ ╲     ',
  '    ╱──┼──╲    ',
  '   ╱   │   ╲   ',
  '  ╱────┴────╲  ',
];

// Ultra-compact single-line glyph
export const AVATAR_GLYPH = '▲';

interface AvatarProps {
  size?: 'glyph' | 'small' | 'large';
  color?: string;
}

export const ArgoAvatar = memo(function ArgoAvatar({ size = 'small', color = 'green' }: AvatarProps) {
  if (size === 'glyph') {
    return <Text color={color as any} bold>{AVATAR_GLYPH}</Text>;
  }

  const lines = size === 'large' ? AVATAR_LARGE : AVATAR_SMALL;

  return (
    <Box flexDirection="column">
      {lines.map((line, i) => (
        <Text key={i} color={color as any} bold>
          {line}
        </Text>
      ))}
    </Box>
  );
});

/**
 * Multi-color "tinted" version — sail catches light:
 * top of the sail is bright cyan (sky), bottom is green (water reflection).
 */
export const ArgoAvatarTinted = memo(function ArgoAvatarTinted({ size = 'small' }: { size?: 'small' | 'large' }) {
  const lines = size === 'large' ? AVATAR_LARGE : AVATAR_SMALL;
  const palette = size === 'large'
    ? ['cyan', 'cyan', 'cyan', 'green', 'green', 'green']
    : ['cyan', 'green', 'green'];

  return (
    <Box flexDirection="column">
      {lines.map((line, i) => (
        <Text key={i} color={palette[i] as any} bold>
          {line}
        </Text>
      ))}
    </Box>
  );
});

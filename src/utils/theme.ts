// Color theme system for Roo

export interface Theme {
  name: string;
  colors: {
    // Primary colors
    primary: string;
    secondary: string;
    accent: string;

    // Status colors
    success: string;
    warning: string;
    error: string;
    info: string;

    // UI colors
    background: string;
    foreground: string;
    muted: string;
    border: string;

    // Role colors
    user: string;
    assistant: string;
    system: string;
    tool: string;

    // Syntax highlighting
    keyword: string;
    string: string;
    number: string;
    comment: string;
    function: string;
    type: string;
  };
  icons: {
    user: string;
    assistant: string;
    system: string;
    tool: string;
    thinking: string;
    success: string;
    error: string;
    warning: string;
    info: string;
  };
}

export const themes: Record<string, Theme> = {
  default: {
    name: 'Default',
    colors: {
      primary: 'green',
      secondary: 'cyan',
      accent: 'magenta',
      success: 'green',
      warning: 'yellow',
      error: 'red',
      info: 'blue',
      background: 'black',
      foreground: 'white',
      muted: 'gray',
      border: 'gray',
      user: 'cyan',
      assistant: 'green',
      system: 'yellow',
      tool: 'magenta',
      keyword: 'blue',
      string: 'yellow',
      number: 'magenta',
      comment: 'gray',
      function: 'cyan',
      type: 'green',
    },
    icons: {
      user: '👤',
      assistant: '🤖',
      system: '⚙️',
      tool: '🔧',
      thinking: '🧠',
      success: '✓',
      error: '✗',
      warning: '⚠',
      info: 'ℹ',
    },
  },

  cyberpunk: {
    name: 'Cyberpunk',
    colors: {
      primary: 'magenta',
      secondary: 'cyan',
      accent: 'yellow',
      success: 'green',
      warning: 'yellow',
      error: 'red',
      info: 'cyan',
      background: 'black',
      foreground: 'white',
      muted: 'gray',
      border: 'magenta',
      user: 'cyan',
      assistant: 'magenta',
      system: 'yellow',
      tool: 'cyan',
      keyword: 'magenta',
      string: 'cyan',
      number: 'yellow',
      comment: 'gray',
      function: 'green',
      type: 'magenta',
    },
    icons: {
      user: '◉',
      assistant: '◈',
      system: '◇',
      tool: '⚡',
      thinking: '⟐',
      success: '▸',
      error: '▹',
      warning: '◃',
      info: '◂',
    },
  },

  minimal: {
    name: 'Minimal',
    colors: {
      primary: 'white',
      secondary: 'gray',
      accent: 'white',
      success: 'green',
      warning: 'yellow',
      error: 'red',
      info: 'blue',
      background: 'black',
      foreground: 'white',
      muted: 'gray',
      border: 'gray',
      user: 'white',
      assistant: 'white',
      system: 'gray',
      tool: 'gray',
      keyword: 'white',
      string: 'gray',
      number: 'white',
      comment: 'gray',
      function: 'white',
      type: 'white',
    },
    icons: {
      user: '>',
      assistant: '<',
      system: '*',
      tool: '#',
      thinking: '...',
      success: '+',
      error: '-',
      warning: '!',
      info: '?',
    },
  },

  ocean: {
    name: 'Ocean',
    colors: {
      primary: 'cyan',
      secondary: 'blue',
      accent: 'green',
      success: 'green',
      warning: 'yellow',
      error: 'red',
      info: 'cyan',
      background: 'black',
      foreground: 'white',
      muted: 'gray',
      border: 'blue',
      user: 'cyan',
      assistant: 'blue',
      system: 'green',
      tool: 'cyan',
      keyword: 'blue',
      string: 'green',
      number: 'cyan',
      comment: 'gray',
      function: 'cyan',
      type: 'blue',
    },
    icons: {
      user: '🌊',
      assistant: '🐚',
      system: '⚓',
      tool: '🔱',
      thinking: '💭',
      success: '✓',
      error: '✗',
      warning: '⚠',
      info: 'ℹ',
    },
  },

  forest: {
    name: 'Forest',
    colors: {
      primary: 'green',
      secondary: 'yellow',
      accent: 'cyan',
      success: 'green',
      warning: 'yellow',
      error: 'red',
      info: 'cyan',
      background: 'black',
      foreground: 'white',
      muted: 'gray',
      border: 'green',
      user: 'yellow',
      assistant: 'green',
      system: 'cyan',
      tool: 'yellow',
      keyword: 'green',
      string: 'yellow',
      number: 'cyan',
      comment: 'gray',
      function: 'green',
      type: 'cyan',
    },
    icons: {
      user: '🌿',
      assistant: '🌲',
      system: '🍃',
      tool: '🪓',
      thinking: '🌱',
      success: '✓',
      error: '✗',
      warning: '⚠',
      info: 'ℹ',
    },
  },
};

// Default theme
let currentTheme: Theme = themes.default;

export function getTheme(): Theme {
  return currentTheme;
}

export function setTheme(themeName: string): void {
  if (themes[themeName]) {
    currentTheme = themes[themeName];
  }
}

export function listThemes(): string[] {
  return Object.keys(themes);
}

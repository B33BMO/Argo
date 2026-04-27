// Icon system using Nerd Fonts with ASCII fallbacks
// Nerd Fonts: https://www.nerdfonts.com/

export interface IconSet {
  // Roles
  user: string;
  assistant: string;
  system: string;
  tool: string;

  // Tools
  bash: string;
  terminal: string;
  file: string;
  fileCode: string;
  folder: string;
  folderOpen: string;
  search: string;
  searchFile: string;
  edit: string;
  write: string;
  globe: string;
  api: string;

  // Status - simple dots
  dot: string;
  success: string;
  error: string;
  warning: string;
  info: string;
  pending: string;
  running: string;
  thinking: string;
  response: string;

  // UI
  chevronRight: string;
  chevronDown: string;
  chevronUp: string;
  arrow: string;
  circle: string;
  circleFilled: string;
  bolt: string;
  clock: string;
  settings: string;
}

// All icon sets use the same simple dot-based status indicators
// The dot (●) is colored by the component, not here

// Nerd Font icons (requires a Nerd Font to be installed)
export const nerdIcons: IconSet = {
  // Roles
  user: '',        // nf-fa-user
  assistant: '󰚩',   // nf-md-robot
  system: '',      // nf-fa-cog
  tool: '',        // nf-fa-wrench

  // Tools
  bash: '',        // nf-dev-terminal
  terminal: '',    // nf-fa-terminal
  file: '',        // nf-fa-file
  fileCode: '',    // nf-fa-file_code
  folder: '',      // nf-fa-folder
  folderOpen: '',  // nf-fa-folder_open
  search: '',      // nf-fa-search
  searchFile: '',  // nf-seti-search
  edit: '',        // nf-fa-pencil
  write: '',       // nf-fa-floppy_o
  globe: '',       // nf-fa-globe
  api: '',        // nf-fa-plug

  // Status - simple dots (colored by component)
  dot: '●',
  success: '●',     // green
  error: '●',       // red
  warning: '●',     // yellow/orange
  info: '●',        // blue
  pending: '○',     // gray outline
  running: '●',     // yellow/orange animated
  thinking: '●',    // orange
  response: '●',    // white

  // UI
  chevronRight: '',
  chevronDown: '',
  chevronUp: '',
  arrow: '',
  circle: '○',
  circleFilled: '●',
  bolt: '',
  clock: '',
  settings: '',
};

// Unicode icons (works in most modern terminals)
export const unicodeIcons: IconSet = {
  // Roles
  user: '◆',
  assistant: '◈',
  system: '◇',
  tool: '⚙',

  // Tools
  bash: '❯',
  terminal: '⌘',
  file: '◻',
  fileCode: '◼',
  folder: '▤',
  folderOpen: '▦',
  search: '◎',
  searchFile: '⊕',
  edit: '✎',
  write: '✐',
  globe: '◉',
  api: '⇄',

  // Status - simple dots (colored by component)
  dot: '●',
  success: '●',
  error: '●',
  warning: '●',
  info: '●',
  pending: '○',
  running: '●',
  thinking: '●',
  response: '●',

  // UI
  chevronRight: '›',
  chevronDown: '˅',
  chevronUp: '˄',
  arrow: '→',
  circle: '○',
  circleFilled: '●',
  bolt: '⚡',
  clock: '◔',
  settings: '⚙',
};

// ASCII fallback icons (works everywhere)
export const asciiIcons: IconSet = {
  // Roles
  user: '>',
  assistant: '*',
  system: '#',
  tool: '$',

  // Tools
  bash: '$',
  terminal: '>_',
  file: '[]',
  fileCode: '[#]',
  folder: '[/]',
  folderOpen: '[-]',
  search: '?',
  searchFile: '??',
  edit: '~',
  write: '+',
  globe: '@',
  api: '<>',

  // Status - simple dots/chars
  dot: '*',
  success: '*',
  error: 'x',
  warning: '!',
  info: 'i',
  pending: 'o',
  running: '*',
  thinking: '.',
  response: '*',

  // UI
  chevronRight: '>',
  chevronDown: 'v',
  chevronUp: '^',
  arrow: '->',
  circle: 'o',
  circleFilled: '*',
  bolt: '!',
  clock: '()',
  settings: '%',
};

export type IconStyle = 'nerd' | 'unicode' | 'ascii';

let currentStyle: IconStyle = 'nerd';
let currentIcons: IconSet = nerdIcons;

export function setIconStyle(style: IconStyle): void {
  currentStyle = style;
  switch (style) {
    case 'nerd':
      currentIcons = nerdIcons;
      break;
    case 'unicode':
      currentIcons = unicodeIcons;
      break;
    case 'ascii':
      currentIcons = asciiIcons;
      break;
  }
}

export function getIconStyle(): IconStyle {
  return currentStyle;
}

export function getIcons(): IconSet {
  return currentIcons;
}

export function icon(name: keyof IconSet): string {
  return currentIcons[name];
}

// Tool-specific icon mapping
export function getToolIcon(toolName: string): string {
  const toolIcons: Record<string, keyof IconSet> = {
    bash: 'bash',
    read_file: 'file',
    write_file: 'write',
    edit_file: 'edit',
    glob: 'search',
    grep: 'searchFile',
    list_dir: 'folder',
    curl: 'globe',
  };

  const iconKey = toolIcons[toolName] || 'tool';
  return currentIcons[iconKey];
}

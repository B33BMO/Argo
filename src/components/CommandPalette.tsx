import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import { icon } from '../utils/icons.js';
import { searchCommands, BUILTIN_COMMANDS, type CompletionItem } from '../utils/autocomplete.js';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (command: string) => void;
}

export function CommandPalette({ isOpen, onClose, onSelect }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [results, setResults] = useState<CompletionItem[]>([]);

  // Update results when query changes
  useEffect(() => {
    const items = searchCommands(query);
    setResults(items);
    setSelectedIndex(0);
  }, [query]);

  // Reset when opened
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setResults(searchCommands(''));
    }
  }, [isOpen]);

  useInput((input, key) => {
    if (!isOpen) return;

    if (key.escape) {
      onClose();
      return;
    }

    if (key.return) {
      if (results[selectedIndex]) {
        onSelect(results[selectedIndex].value);
        onClose();
      }
      return;
    }

    if (key.upArrow) {
      setSelectedIndex(i => Math.max(0, i - 1));
      return;
    }

    if (key.downArrow) {
      setSelectedIndex(i => Math.min(results.length - 1, i + 1));
      return;
    }

    if (key.backspace || key.delete) {
      setQuery(q => q.slice(0, -1));
      return;
    }

    // Regular character input
    if (input && input.length === 1 && !key.ctrl && !key.meta) {
      setQuery(q => q + input);
    }
  }, { isActive: isOpen });

  if (!isOpen) return null;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      padding={1}
      marginY={1}
    >
      {/* Search input */}
      <Box marginBottom={1}>
        <Text color="cyan">{icon('search')} </Text>
        <Text color="white">{query}</Text>
        <Text color="cyan">▎</Text>
      </Box>

      {/* Divider */}
      <Box>
        <Text color="gray">{'─'.repeat(40)}</Text>
      </Box>

      {/* Results */}
      <Box flexDirection="column" marginTop={1}>
        {results.length === 0 ? (
          <Text color="gray" dimColor>No commands found</Text>
        ) : (
          results.slice(0, 10).map((item, i) => (
            <CommandItem
              key={item.value}
              item={item}
              isSelected={i === selectedIndex}
            />
          ))
        )}
      </Box>

      {/* Help text */}
      <Box marginTop={1}>
        <Text color="gray" dimColor>
          ↑↓ navigate · Enter select · Esc close
        </Text>
      </Box>
    </Box>
  );
}

interface CommandItemProps {
  item: CompletionItem;
  isSelected: boolean;
}

function CommandItem({ item, isSelected }: CommandItemProps) {
  return (
    <Box>
      <Text color={isSelected ? 'cyan' : 'white'}>
        {isSelected ? icon('chevronRight') + ' ' : '  '}
      </Text>
      <Text color={isSelected ? 'cyan' : 'white'} bold={isSelected}>
        {item.display}
      </Text>
      {item.description && (
        <Text color="gray" dimColor>
          {' '}- {item.description}
        </Text>
      )}
    </Box>
  );
}

// Autocomplete dropdown for inline suggestions
interface AutocompleteDropdownProps {
  items: CompletionItem[];
  selectedIndex: number;
  onSelect: (item: CompletionItem) => void;
  maxItems?: number;
}

export function AutocompleteDropdown({
  items,
  selectedIndex,
  onSelect,
  maxItems = 8,
}: AutocompleteDropdownProps) {
  if (items.length === 0) return null;

  const displayItems = items.slice(0, maxItems);

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor="gray"
      paddingX={1}
      marginTop={1}
    >
      {displayItems.map((item, i) => (
        <Box key={item.value}>
          <Text color={i === selectedIndex ? 'cyan' : 'gray'}>
            {i === selectedIndex ? icon('chevronRight') : ' '}
          </Text>
          <Text color={item.type === 'directory' ? 'blue' : item.type === 'command' ? 'magenta' : 'white'}>
            {item.display}
          </Text>
          {item.description && (
            <Text color="gray" dimColor>
              {' '}{item.description}
            </Text>
          )}
        </Box>
      ))}
      {items.length > maxItems && (
        <Text color="gray" dimColor>
          ... and {items.length - maxItems} more
        </Text>
      )}
    </Box>
  );
}

// Quick action bar (for common actions)
interface QuickAction {
  key: string;
  label: string;
  action: () => void;
}

interface QuickActionBarProps {
  actions: QuickAction[];
}

export function QuickActionBar({ actions }: QuickActionBarProps) {
  return (
    <Box>
      {actions.map((action, i) => (
        <React.Fragment key={action.key}>
          {i > 0 && <Text color="gray"> │ </Text>}
          <Text color="gray">[</Text>
          <Text color="cyan">{action.key}</Text>
          <Text color="gray">] {action.label}</Text>
        </React.Fragment>
      ))}
    </Box>
  );
}

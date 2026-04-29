import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { icon } from '../utils/icons.js';
import {
  listSessions,
  searchSessions,
  deleteSession,
  type SessionSummary,
} from '../utils/history.js';

interface SessionPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (sessionId: string) => void;
  onNewSession: () => void;
}

export function SessionPicker({
  isOpen,
  onClose,
  onSelect,
  onNewSession,
}: SessionPickerProps) {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [loading, setLoading] = useState(true);

  // Load sessions
  useEffect(() => {
    if (!isOpen) return;

    setLoading(true);
    listSessions().then(list => {
      setSessions(list);
      setSelectedIndex(0);
      setLoading(false);
    });
  }, [isOpen]);

  // Search when query changes
  useEffect(() => {
    if (!searchQuery) {
      listSessions().then(setSessions);
      return;
    }

    const timer = setTimeout(async () => {
      const results = await searchSessions(searchQuery);
      setSessions(results);
      setSelectedIndex(0);
    }, 200);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  useInput((input, key) => {
    if (!isOpen) return;

    if (key.escape) {
      if (isSearching) {
        setIsSearching(false);
        setSearchQuery('');
      } else {
        onClose();
      }
      return;
    }

    if (isSearching) {
      if (key.return) {
        setIsSearching(false);
        return;
      }
      if (key.backspace || key.delete) {
        setSearchQuery(q => q.slice(0, -1));
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setSearchQuery(q => q + input);
      }
      return;
    }

    if (key.return) {
      if (sessions[selectedIndex]) {
        onSelect(sessions[selectedIndex].id);
        onClose();
      }
      return;
    }

    if (key.upArrow || input === 'k') {
      setSelectedIndex(i => Math.max(0, i - 1));
      return;
    }

    if (key.downArrow || input === 'j') {
      setSelectedIndex(i => Math.min(sessions.length - 1, i + 1));
      return;
    }

    if (input === '/') {
      setIsSearching(true);
      return;
    }

    if (input === 'n') {
      onNewSession();
      onClose();
      return;
    }

    if (input === 'd' && sessions[selectedIndex]) {
      const id = sessions[selectedIndex].id;
      deleteSession(id).then(() => {
        setSessions(s => {
          const next = s.filter(x => x.id !== id);
          // Clamp the selected index to the new bounds.
          setSelectedIndex(i => Math.max(0, Math.min(i, next.length - 1)));
          return next;
        });
      });
      return;
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
      {/* Header */}
      <Box marginBottom={1}>
        <Text color="cyan" bold>{icon('folder')} Sessions</Text>
      </Box>

      {/* Search bar */}
      <Box marginBottom={1}>
        {isSearching ? (
          <Box>
            <Text color="cyan">{icon('search')} </Text>
            <Text>{searchQuery}</Text>
            <Text color="cyan">▎</Text>
          </Box>
        ) : (
          <Text color="gray" dimColor>Press / to search</Text>
        )}
      </Box>

      {/* Divider */}
      <Text color="gray">{'─'.repeat(40)}</Text>

      {/* Sessions list */}
      <Box flexDirection="column" marginTop={1}>
        {loading ? (
          <Text color="gray">Loading...</Text>
        ) : sessions.length === 0 ? (
          <Text color="gray" dimColor>
            {searchQuery ? 'No sessions found' : 'No sessions yet'}
          </Text>
        ) : (
          sessions.slice(0, 10).map((session, i) => (
            <SessionItem
              key={session.id}
              session={session}
              isSelected={i === selectedIndex}
            />
          ))
        )}
        {sessions.length > 10 && (
          <Text color="gray" dimColor>
            ... and {sessions.length - 10} more
          </Text>
        )}
      </Box>

      {/* Help */}
      <Box marginTop={1}>
        <Text color="gray" dimColor>
          ↑↓/jk navigate · Enter select · n new · d delete · Esc close
        </Text>
      </Box>
    </Box>
  );
}

interface SessionItemProps {
  session: SessionSummary;
  isSelected: boolean;
}

function SessionItem({ session, isSelected }: SessionItemProps) {
  const date = new Date(session.updatedAt);
  const dateStr = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
  const timeStr = date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  return (
    <Box>
      <Text color={isSelected ? 'cyan' : 'white'}>
        {isSelected ? icon('chevronRight') + ' ' : '  '}
      </Text>
      <Box width={24}>
        <Text color={isSelected ? 'cyan' : 'white'} bold={isSelected} wrap="truncate">
          {session.name}
        </Text>
      </Box>
      <Text color="gray" dimColor>
        {' '}({session.messageCount} msgs) · {dateStr} {timeStr}
      </Text>
    </Box>
  );
}


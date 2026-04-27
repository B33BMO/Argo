import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import { Header } from './components/Header.js';
import { MessageBubble, StreamingMessage } from './components/MessageBubble.js';
import { Input } from './components/Input.js';
import { ThinkingPanel, ThinkingIndicator } from './components/ThinkingPanel.js';
import { StatusLine } from './components/StatusLine.js';
import { ToolCallCard } from './components/ToolCallCard.js';
import { AgentRunPanel } from './components/AgentRunPanel.js';
import { CommandPalette } from './components/CommandPalette.js';
import { SessionPicker } from './components/SessionPicker.js';
import { SkillsPanel } from './components/SkillsPanel.js';
import { ProvidersPanel } from './components/ProvidersPanel.js';
import { buildProvider, type ProviderConfig } from './providers/manager.js';
import { toolRegistry } from './tools/index.js';
import { createAgentTool } from './tools/agent.js';

function toolRegistryReregister(provider: LLMProvider) {
  toolRegistry.register(createAgentTool(provider));
}
import { useChat } from './hooks/useChat.js';
import { useThrottledValue } from './hooks/useThrottledValue.js';
import { playSound, notifyComplete, notifyError } from './utils/sound.js';
import { copyLastCodeBlock } from './utils/clipboard.js';
import { exportAsMarkdown } from './utils/export.js';
import { createSession, loadSession, saveSession, type Session } from './utils/history.js';
import { getGitStatus, type GitStatus } from './utils/git.js';
import type { LLMProvider, ToolCall } from './providers/types.js';
import type { ToolResult } from './tools/types.js';

// Import tools to register them
import './tools/index.js';

interface AppProps {
  provider: LLMProvider;
  providerName?: string;
  modelName?: string;
  systemPrompt?: string;
  vimMode?: boolean;
  soundEnabled?: boolean;
}

const DEFAULT_SYSTEM_PROMPT = `You are Roo, a helpful AI assistant with access to tools for file operations, shell commands, and web requests.

When helping users:
1. Use tools to explore and modify the filesystem as needed
2. Execute shell commands to accomplish tasks
3. Be concise but thorough in your explanations
4. If you encounter an error, explain what went wrong and try to fix it

Available tools: bash, read_file, write_file, edit_file, glob, grep, list_dir, curl`;

export function App({
  provider: initialProvider,
  providerName: initialProviderName,
  modelName: initialModelName = 'Unknown',
  systemPrompt,
  vimMode = false,
  soundEnabled = true,
}: AppProps) {
  const { exit } = useApp();

  // Live provider state — can be hot-swapped from the providers panel
  const [provider, setProvider] = useState<LLMProvider>(initialProvider);
  const [providerName, setProviderName] = useState(initialProviderName || initialProvider.name);
  const [modelName, setModelName] = useState(initialModelName);

  // UI state
  const [thinkingCollapsed, setThinkingCollapsed] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showSessionPicker, setShowSessionPicker] = useState(false);
  const [showSkillsPanel, setShowSkillsPanel] = useState(false);
  const [showProvidersPanel, setShowProvidersPanel] = useState(false);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Session state
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [inputHistory, setInputHistory] = useState<string[]>([]);

  // Git state — refreshed once per response, not on a timer
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);

  // Confirmation state
  const [confirmPrompt, setConfirmPrompt] = useState<{
    message: string;
    resolve: (confirmed: boolean) => void;
  } | null>(null);

  // Track tool execution state
  const [toolStates, setToolStates] = useState<
    Record<string, { status: 'running' | 'success' | 'error'; result?: string; error?: string; startTime?: number }>
  >({});

  const startTimeRef = useRef<number>(0);
  const [responseTime, setResponseTime] = useState<number | undefined>();

  // Show notification
  const showNotification = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  }, []);

  // Initialize session
  useEffect(() => {
    createSession().then(session => {
      setCurrentSession(session);
    });
  }, []);

  // Refresh git status once on mount — no polling
  useEffect(() => {
    getGitStatus().then(setGitStatus);
  }, []);

  const handleConfirmation = useCallback(
    async (message: string): Promise<boolean> => {
      return new Promise((resolve) => {
        setConfirmPrompt({ message, resolve });
      });
    },
    []
  );

  const handleToolCall = useCallback((toolCall: ToolCall) => {
    if (soundEnabled) playSound('tool_start');
    setToolStates((prev) => ({
      ...prev,
      [toolCall.id]: { status: 'running', startTime: Date.now() },
    }));
  }, [soundEnabled]);

  const handleToolResult = useCallback(
    (toolCall: ToolCall, result: ToolResult) => {
      if (soundEnabled) playSound('tool_end');
      setToolStates((prev) => {
        const startTime = prev[toolCall.id]?.startTime || Date.now();
        return {
          ...prev,
          [toolCall.id]: {
            status: result.success ? 'success' : 'error',
            result: result.output,
            error: result.error,
            startTime,
          },
        };
      });
    },
    [soundEnabled]
  );

  const {
    messages,
    isLoading,
    currentReasoning: rawReasoning,
    currentResponse: rawResponse,
    error,
    executingTool,
    pendingToolCalls,
    sendMessage,
    abort,
    clearHistory,
  } = useChat({
    provider,
    systemPrompt: systemPrompt || DEFAULT_SYSTEM_PROMPT,
    onToolCall: handleToolCall,
    onToolResult: handleToolResult,
    requestConfirmation: handleConfirmation,
  });

  // Throttle streaming text to ~20fps to eliminate per-token re-render flicker
  const currentReasoning = useThrottledValue(rawReasoning, 50);
  const currentResponse = useThrottledValue(rawResponse, 50);

  // Refresh git status after each response completes
  useEffect(() => {
    if (!isLoading) getGitStatus().then(setGitStatus);
  }, [isLoading]);

  // Sound on completion/error
  useEffect(() => {
    if (!isLoading && startTimeRef.current > 0) {
      setResponseTime(Date.now() - startTimeRef.current);
      if (soundEnabled) {
        if (error) {
          notifyError();
        } else {
          notifyComplete();
        }
      }
    }
  }, [isLoading, error, soundEnabled]);

  // Save session when messages change
  useEffect(() => {
    if (currentSession && messages.length > 0) {
      const updatedSession = { ...currentSession, messages };
      saveSession(updatedSession);
    }
  }, [messages, currentSession]);

  // Handle commands
  const executeCommand = useCallback(async (command: string) => {
    const cmd = command.replace(/^\//, '').toLowerCase();
    const args = cmd.split(' ').slice(1).join(' ');

    switch (cmd.split(' ')[0]) {
      case 'clear':
        clearHistory();
        setToolStates({});
        showNotification('Conversation cleared', 'info');
        break;

      case 'exit':
      case 'quit':
        exit();
        break;

      case 'copy':
        const result = await copyLastCodeBlock(messages[messages.length - 1]?.content || '');
        if (result?.success) {
          showNotification('Copied to clipboard!', 'success');
        } else {
          showNotification('No code block to copy', 'error');
        }
        break;

      case 'export':
        try {
          const path = await exportAsMarkdown(messages, undefined, currentSession?.name);
          showNotification(`Exported to ${path}`, 'success');
        } catch {
          showNotification('Export failed', 'error');
        }
        break;

      case 'session':
        setShowSessionPicker(true);
        break;

      case 'providers':
      case 'provider':
        setShowProvidersPanel(true);
        break;

      case 'model':
        if (args) {
          setModelName(args);
          showNotification(`Model set to ${args}`, 'success');
        } else {
          showNotification(`Current model: ${modelName}`, 'info');
        }
        break;

      case 'help':
        showNotification('^P cmd · ^O sessions · ^S skills · ^R providers · ^L clear', 'info');
        break;

      case 'tokens':
        showNotification(`See status line for token usage`, 'info');
        break;

      default:
        showNotification(`Unknown command: ${cmd}`, 'error');
    }
  }, [clearHistory, exit, messages, currentSession, modelName, showNotification]);

  useInput((input, key) => {
    // Skip if modal is open
    if (showCommandPalette || showSessionPicker || showSkillsPanel || showProvidersPanel) return;

    // Handle confirmation prompts
    if (confirmPrompt) {
      if (input.toLowerCase() === 'y' || key.return) {
        confirmPrompt.resolve(true);
        setConfirmPrompt(null);
      } else if (input.toLowerCase() === 'n' || key.escape) {
        confirmPrompt.resolve(false);
        setConfirmPrompt(null);
      }
      return;
    }

    // Ctrl+P: Command palette
    if (key.ctrl && input === 'p') {
      setShowCommandPalette(true);
      return;
    }

    // Ctrl+O: Session picker
    if (key.ctrl && input === 'o') {
      setShowSessionPicker(true);
      return;
    }

    // Ctrl+S: Skills/Agents panel
    if (key.ctrl && input === 's') {
      setShowSkillsPanel(true);
      return;
    }

    // Ctrl+R: Providers panel (R for "providers"/swap)
    if (key.ctrl && input === 'r') {
      setShowProvidersPanel(true);
      return;
    }

    // Tab: Toggle thinking panel
    if (key.tab && !isLoading) {
      setThinkingCollapsed((c) => !c);
      return;
    }

    // Ctrl+C: Abort or exit
    if (key.ctrl && input === 'c') {
      if (isLoading) {
        abort();
        showNotification('Aborted', 'info');
      } else {
        exit();
      }
      return;
    }

    // Ctrl+L: Clear
    if (key.ctrl && input === 'l') {
      clearHistory();
      setToolStates({});
      setResponseTime(undefined);
      showNotification('Cleared', 'info');
      return;
    }

    // Ctrl+K: Copy last code block
    if (key.ctrl && input === 'k') {
      copyLastCodeBlock(messages[messages.length - 1]?.content || '').then(result => {
        if (result?.success) {
          showNotification('Copied!', 'success');
        }
      });
      return;
    }
  });

  const handleSubmit = useCallback(
    (value: string) => {
      // Handle commands
      if (value.startsWith('/')) {
        executeCommand(value);
        return;
      }

      // Add to input history
      setInputHistory(prev => [value, ...prev.slice(0, 50)]);

      startTimeRef.current = Date.now();
      setResponseTime(undefined);
      setToolStates({});
      sendMessage(value);
    },
    [sendMessage, executeCommand]
  );

  const handleSessionSelect = useCallback(async (sessionId: string) => {
    const session = await loadSession(sessionId);
    if (session) {
      setCurrentSession(session);
      // Note: Would need to update useChat to accept initial messages
      showNotification(`Loaded: ${session.name}`, 'success');
    }
  }, [showNotification]);

  const handleNewSession = useCallback(async () => {
    const session = await createSession();
    setCurrentSession(session);
    clearHistory();
    showNotification('New session created', 'success');
  }, [clearHistory, showNotification]);

  return (
    <Box flexDirection="column" padding={1} minHeight={20}>
      {/* Header */}
      <Header />

      {/* Notification */}
      {notification && (
        <Box paddingX={1}>
          <Text color={notification.type === 'success' ? 'green' : notification.type === 'error' ? 'red' : 'cyan'}>
            ●{' '}{notification.message}
          </Text>
        </Box>
      )}

      {/* Messages area */}
      <Box flexDirection="column" flexGrow={1}>
        {messages
          .filter((m) => m.role !== 'tool' && m.role !== 'system')
          .map((message, i) => (
            <MessageBubble key={i} message={message} />
          ))}

        {/* Thinking panel */}
        {isLoading && currentReasoning && (
          <ThinkingPanel
            content={currentReasoning}
            isStreaming={isLoading}
            isCollapsed={thinkingCollapsed}
            onToggleCollapse={() => setThinkingCollapsed((c) => !c)}
          />
        )}

        {/* Live agent runs (renders nothing when no agents are running) */}
        <AgentRunPanel />

        {/* Tool calls */}
        {pendingToolCalls.map((tc) => {
          const state = toolStates[tc.id];
          const duration = state?.startTime ? Date.now() - state.startTime : undefined;
          return (
            <ToolCallCard
              key={tc.id}
              name={tc.name}
              arguments={tc.arguments}
              status={state?.status || 'running'}
              result={state?.result}
              error={state?.error}
              duration={state?.status !== 'running' ? duration : undefined}
            />
          );
        })}

        {/* Streaming response */}
        {isLoading && currentResponse && (
          <StreamingMessage content={currentResponse} showCursor={true} />
        )}

        {/* Loading indicator */}
        {isLoading && !currentReasoning && !currentResponse && !executingTool && pendingToolCalls.length === 0 && (
          <Box marginY={1}>
            <ThinkingIndicator />
          </Box>
        )}

        {/* Error display */}
        {error && (
          <Box paddingLeft={2}>
            <Text color="red">● </Text>
            <Text color="red">{error}</Text>
          </Box>
        )}
      </Box>

      {/* Command Palette */}
      <CommandPalette
        isOpen={showCommandPalette}
        onClose={() => setShowCommandPalette(false)}
        onSelect={executeCommand}
      />

      {/* Session Picker */}
      <SessionPicker
        isOpen={showSessionPicker}
        onClose={() => setShowSessionPicker(false)}
        onSelect={handleSessionSelect}
        onNewSession={handleNewSession}
      />

      {/* Skills & Agents Panel */}
      <SkillsPanel
        isOpen={showSkillsPanel}
        onClose={() => setShowSkillsPanel(false)}
      />

      {/* Providers Panel */}
      <ProvidersPanel
        isOpen={showProvidersPanel}
        onClose={() => setShowProvidersPanel(false)}
        onSwitch={(config: ProviderConfig) => {
          const next = buildProvider(config);
          setProvider(next);
          setProviderName(config.label);
          if (config.defaultModel) setModelName(config.defaultModel);
          // Re-register the agent tool so sub-agents use the new provider too
          toolRegistryReregister(next);
          showNotification(`Switched to ${config.label}`, 'success');
        }}
      />

      {/* Confirmation prompt */}
      {confirmPrompt && (
        <Box
          marginY={1}
          borderStyle="round"
          borderColor="yellow"
          padding={1}
          flexDirection="column"
        >
          <Box>
            <Text color="yellow">● </Text>
            <Text color="yellow" bold>
              Confirmation Required
            </Text>
          </Box>
          <Box marginTop={1}>
            <Text>{confirmPrompt.message}</Text>
          </Box>
          <Box marginTop={1}>
            <Text color="gray">
              Press <Text color="green" bold>y</Text> to confirm or{' '}
              <Text color="red" bold>n</Text> to cancel
            </Text>
          </Box>
        </Box>
      )}

      {/* Input */}
      <Box marginTop={1}>
        <Input
          onSubmit={handleSubmit}
          placeholder="Ask me anything... (Ctrl+P for commands)"
          disabled={isLoading || !!confirmPrompt || showCommandPalette || showSessionPicker || showSkillsPanel || showProvidersPanel}
        />
      </Box>

      {/* Single status line — no border, dim, no clock */}
      <StatusLine
        provider={providerName || provider.name}
        model={modelName}
        isLoading={isLoading}
        responseTime={responseTime}
        messages={messages}
        gitStatus={gitStatus}
      />
    </Box>
  );
}

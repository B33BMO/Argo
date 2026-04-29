import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import { Header } from './components/Header.js';
import { MessageBubble } from './components/MessageBubble.js';
import { Input } from './components/Input.js';
import { StatusLine } from './components/StatusLine.js';
import { AgentRunPanel } from './components/AgentRunPanel.js';
import { CommandPalette } from './components/CommandPalette.js';
import { SessionPicker } from './components/SessionPicker.js';
import { SkillsPanel } from './components/SkillsPanel.js';
import { ProvidersPanel } from './components/ProvidersPanel.js';
import { PreflightPanel } from './components/PreflightPanel.js';
import { SuggestionsPanel } from './components/SuggestionsPanel.js';
import { WelcomeScreen } from './components/WelcomeScreen.js';
import { BashOutput, type BashRun } from './components/BashOutput.js';
import { sessionRegistry } from './sessions/shell.js';
import { expandMentions, formatAttachmentSummary } from './utils/mentions.js';
import { getWorkspace } from './utils/workspace.js';
import { mcpRegistry } from './mcp/registry.js';
import { ensureMemoryExists, getMemoryPath } from './utils/memory.js';
import { scanForSuggestions, type Suggestion } from './utils/suggestions.js';
import { skillRegistry } from './skills/registry.js';
import { forkSession } from './utils/history.js';
import { runInit } from './skills/init.js';
import { buildProvider, type ProviderConfig } from './providers/manager.js';
import { toolRegistry } from './tools/index.js';
import { createAgentTool } from './tools/agent.js';
import { createPartyTool } from './tools/party.js';
import { getPeakRate } from './utils/tokenRate.js';

function toolRegistryReregister(provider: LLMProvider) {
  toolRegistry.register(createAgentTool(provider));
  toolRegistry.register(createPartyTool(provider));
}
import { useChat } from './hooks/useChat.js';
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
  resumeOnLaunch?: boolean;
}

// Keep this lean. Long, cautionary system prompts make smaller models loop on
// safe operations (list_dir, read_file) and never commit to writes. The tool
// layer enforces the secret-file ban itself; we don't need to belabor it here.
const DEFAULT_SYSTEM_PROMPT = `You are Argo, an AI coding companion with tools for file ops, shell, and HTTP.

Behavior:
- Pick a plan, execute it, and finish. Don't re-explore the same directory or re-read the same file just to "check".
- After at most a couple of rounds of exploration, COMMIT to producing the final answer or write_file output.
- When the task is to write a file, actually call write_file — don't just describe what you'd write.
- If a tool refuses (sensitive file, permission), don't try to bypass; tell the user briefly and move on.
- Be concise. Lead with the answer or the change, not a preamble.

Tools: bash, read_file, write_file, edit_file, glob, grep, list_dir, curl, agent, party.`;

export function App({
  provider: initialProvider,
  providerName: initialProviderName,
  modelName: initialModelName = 'Unknown',
  systemPrompt,
  vimMode = false,
  soundEnabled = true,
  resumeOnLaunch = false,
}: AppProps) {
  const { exit } = useApp();

  // Live provider state — can be hot-swapped from the providers panel
  const [provider, setProvider] = useState<LLMProvider>(initialProvider);
  const [providerName, setProviderName] = useState(initialProviderName || initialProvider.name);
  const [modelName, setModelName] = useState(initialModelName);

  // UI state
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showSessionPicker, setShowSessionPicker] = useState(false);
  const [showSkillsPanel, setShowSkillsPanel] = useState(false);
  const [showProvidersPanel, setShowProvidersPanel] = useState(false);
  const [showPreflightPanel, setShowPreflightPanel] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showReasoning, setShowReasoning] = useState(false);
  const [bashRuns, setBashRuns] = useState<BashRun[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [activeSuggestion, setActiveSuggestion] = useState(0);
  const [activeSessionLabel, setActiveSessionLabel] = useState<string>('local');
  // Open the session picker on launch if -r/--resume was passed
  useEffect(() => {
    if (resumeOnLaunch) {
      setShowSessionPicker(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const notificationTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [lastTokensPerSec, setLastTokensPerSec] = useState<number | undefined>();

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

  // Track tool execution state. Keyed by tool-call id so historical cards
  // keep their status + duration after later turns submit. Only cleared by
  // /clear or by loading a different session — never by simply sending the
  // next message (that wiped duration on every prior card).
  const [toolStates, setToolStates] = useState<
    Record<string, {
      status: 'running' | 'success' | 'error';
      result?: string;
      error?: string;
      startTime?: number;
      endTime?: number;
    }>
  >({});

  const startTimeRef = useRef<number>(0);
  const [responseTime, setResponseTime] = useState<number | undefined>();

  // Queued submissions: messages typed while a turn is in flight.
  const [queuedMessages, setQueuedMessages] = useState<string[]>([]);

  // Show notification — clears any pending dismiss so back-to-back notifications
  // don't get cut short by an earlier timer firing.
  const showNotification = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    if (notificationTimerRef.current) clearTimeout(notificationTimerRef.current);
    setNotification({ message, type });
    notificationTimerRef.current = setTimeout(() => {
      setNotification(null);
      notificationTimerRef.current = null;
    }, 3000);
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

  // Start MCP servers in the background (non-blocking)
  useEffect(() => {
    mcpRegistry.startAll().then(({ started, failed }) => {
      if (started.length > 0) {
        showNotification(`MCP: started ${started.join(', ')}`, 'success');
      }
      for (const f of failed) {
        showNotification(`MCP "${f.id}" failed: ${f.error.slice(0, 80)}`, 'error');
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
            endTime: Date.now(),
          },
        };
      });
    },
    [soundEnabled]
  );

  const {
    messages,
    isLoading,
    error,
    executingTool,
    sendMessage,
    abort,
    clearHistory,
    reloadMemory,
    injectSkill,
    setMessages,
  } = useChat({
    provider,
    systemPrompt: systemPrompt || DEFAULT_SYSTEM_PROMPT,
    onToolCall: handleToolCall,
    onToolResult: handleToolResult,
    requestConfirmation: handleConfirmation,
  });

  // Refresh git status after each response completes
  useEffect(() => {
    if (!isLoading) getGitStatus().then(setGitStatus);
  }, [isLoading]);

  // Scan the most recent assistant message for inline suggestions
  useEffect(() => {
    if (isLoading) return;
    const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant');
    if (!lastAssistant?.content) {
      setSuggestions([]);
      return;
    }
    const found = scanForSuggestions(lastAssistant.content);
    setSuggestions(found);
    setActiveSuggestion(0);
  }, [messages, isLoading]);

  // Sound on completion/error + capture peak token rate from this turn
  useEffect(() => {
    if (!isLoading && startTimeRef.current > 0) {
      setResponseTime(Date.now() - startTimeRef.current);
      const peak = getPeakRate();
      if (peak > 0) setLastTokensPerSec(peak);
      if (soundEnabled) {
        if (error) {
          notifyError();
        } else {
          notifyComplete();
        }
      }
    }
  }, [isLoading, error, soundEnabled]);

  // Save session when messages change — debounced so we don't hit disk on
  // every assistant turn (and definitely not while streaming).
  useEffect(() => {
    if (!currentSession || messages.length === 0) return;
    const t = setTimeout(() => {
      saveSession({ ...currentSession, messages });
    }, 1500);
    return () => clearTimeout(t);
  }, [messages, currentSession]);

  // Handle commands
  const executeCommand = useCallback(async (command: string) => {
    const cmd = command.replace(/^\//, '').toLowerCase();
    const args = cmd.split(' ').slice(1).join(' ');

    switch (cmd.split(' ')[0]) {
      case 'clear':
        clearHistory();
        setToolStates({});
        setBashRuns([]);
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
      case 'sessions':
      case 'conversations':
        setShowSessionPicker(true);
        break;

      case 'memory': {
        if (args === 'path') {
          showNotification(getMemoryPath(), 'info');
        } else if (args === 'edit' || args === 'open') {
          await ensureMemoryExists();
          showNotification(`Edit: ${getMemoryPath()}`, 'info');
        } else {
          await ensureMemoryExists();
          await reloadMemory();
          showNotification(`Memory loaded · ${getMemoryPath()}`, 'success');
        }
        break;
      }

      case 'skill': {
        if (!args) {
          showNotification('Usage: /skill <name>', 'error');
          break;
        }
        await skillRegistry.load();
        const skill = skillRegistry.get(args.trim());
        if (!skill) {
          showNotification(`Unknown skill: ${args}`, 'error');
        } else {
          injectSkill(`# ${skill.frontmatter.name}\n${skill.body}`);
          showNotification(`Skill "${skill.frontmatter.name}" attached to next message`, 'success');
        }
        break;
      }

      case 'fork': {
        if (!currentSession) {
          showNotification('No active session to fork', 'error');
          break;
        }
        const sourceSnapshot = { ...currentSession, messages };
        const fork = await forkSession(sourceSnapshot, messages.length, args || undefined);
        setCurrentSession(fork);
        showNotification(`Forked → ${fork.name}`, 'success');
        break;
      }

      case 'preflight':
      case 'doctor':
      case 'check':
        setShowPreflightPanel(true);
        break;

      case 'init': {
        const ws = getWorkspace();
        showNotification('Argo is exploring the project…', 'info');
        try {
          const { path: outPath, bytes } = await runInit(provider, {
            cwd: ws.cwd,
            env: process.env as Record<string, string>,
          });
          showNotification(`Wrote ${outPath} (${bytes} chars)`, 'success');
        } catch (err) {
          showNotification(`/init failed: ${(err as Error).message.slice(0, 80)}`, 'error');
        }
        break;
      }

      case 'party': {
        if (!args) {
          showNotification('Usage: /party <topic>', 'error');
          break;
        }
        // Hand the topic to the LLM with a strong nudge to use the party tool
        sendMessage(`Use the party tool to stage a debate on: ${args}\n\nInvite at least 3 agents (try explorer, reviewer, debugger) and run 2 rounds. Don't summarize — just run the tool.`);
        break;
      }

      case 'mcp': {
        const list = mcpRegistry.list();
        if (list.length === 0) {
          showNotification(`No MCP servers running. Configure at ${mcpRegistry.getConfigPath()}`, 'info');
        } else {
          const summary = list.map(s => `${s.alive ? '●' : '○'} ${s.id} (${s.tools} tools)`).join(' · ');
          showNotification(`MCP: ${summary}`, 'info');
        }
        break;
      }

      case 'cwd':
      case 'pwd': {
        const { getWorkspace } = await import('./utils/workspace.js');
        showNotification(getWorkspace().display, 'info');
        break;
      }

      case 'soul': {
        const { loadSoul, getSoulPath, resetSoul } = await import('./soul/soul.js');
        if (args === 'reset') {
          await resetSoul();
          showNotification('Soul reset to defaults', 'success');
        } else if (args === 'path') {
          showNotification(getSoulPath(), 'info');
        } else {
          const soul = await loadSoul();
          const lines = soul.content.split('\n').length;
          showNotification(`Soul: ${lines} lines · ${getSoulPath()}`, 'info');
        }
        break;
      }

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
        setShowHelp(true);
        break;

      case 'retry': {
        // Re-fire the last user message verbatim. Useful when the model went
        // silent and you want a fresh roll without retyping.
        const lastUser = [...messages].reverse().find(m => m.role === 'user');
        if (!lastUser) {
          showNotification('No user message to retry', 'error');
        } else {
          sendMessage(lastUser.content);
        }
        break;
      }

      case 'continue':
      case 'go': {
        // Nudge the model to keep going after it went silent. The text is a
        // synthetic user turn that asks for the next concrete step.
        sendMessage(
          '(continue: produce your text answer or call the next tool. if your task is complete, summarize what you did.)'
        );
        break;
      }

      default:
        showNotification(`Unknown command: ${cmd}`, 'error');
    }
  }, [clearHistory, exit, messages, currentSession, modelName, showNotification, reloadMemory, injectSkill, sendMessage, provider]);

  useInput((input, key) => {
    // Help: Esc / Enter / q / Space close it; ignore other keys so a stray
    // arrow-key doesn't dismiss it before the user has read it.
    if (showHelp) {
      if (key.escape || key.return || input === 'q' || input === ' ' || input === '?') {
        setShowHelp(false);
      }
      return;
    }

    // Skip if modal is open
    if (showCommandPalette || showSessionPicker || showSkillsPanel || showProvidersPanel || showPreflightPanel) return;

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

    // Esc: interrupt the in-flight turn (and drop any queued messages)
    if (key.escape && isLoading) {
      abort();
      if (queuedMessages.length > 0) {
        setQueuedMessages([]);
        showNotification(`Interrupted · dropped ${queuedMessages.length} queued`, 'info');
      } else {
        showNotification('Interrupted', 'info');
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

    // Ctrl+J: cycle through inline suggestions
    if (key.ctrl && input === 'j' && suggestions.length > 0) {
      setActiveSuggestion(i => (i + 1) % suggestions.length);
      return;
    }

    // Ctrl+F: apply the active inline suggestion (sends fix prompt to Argo)
    if (key.ctrl && input === 'f' && suggestions.length > 0 && !isLoading) {
      const s = suggestions[activeSuggestion];
      if (s) {
        sendMessage(s.fixPrompt);
        setSuggestions([]);
      }
      return;
    }

    // Ctrl+T: toggle reasoning visibility for all assistant messages
    if (key.ctrl && input === 't') {
      setShowReasoning(r => !r);
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

  const handleBashLine = useCallback(async (rawCmd: string) => {
    const cmd = rawCmd.trim();
    if (!cmd) return;

    // !exit closes the active session and falls back to local
    if (cmd === 'exit' || cmd === 'quit') {
      const closed = sessionRegistry.closeActive();
      if (closed) {
        setActiveSessionLabel(sessionRegistry.active.info.label);
        showNotification(`Closed ${closed} · back to local`, 'info');
      } else {
        showNotification('Already on local — nothing to close', 'info');
      }
      return;
    }

    // !sessions lists active sessions
    if (cmd === 'sessions' || cmd === 'ls') {
      const list = sessionRegistry.list().map(s => `${s.id === sessionRegistry.getActiveId() ? '● ' : '  '}${s.label} (${s.kind}${s.alive ? '' : ', dead'})`).join('\n');
      showNotification(list || 'No sessions', 'info');
      return;
    }

    // Detect ssh-style command and open as a new session if active is local
    const sshMatch = cmd.match(/^ssh\s+(.+)$/);
    if (sshMatch && sessionRegistry.active.info.kind === 'local') {
      const args = sshMatch[1].trim().split(/\s+/);
      const target = args[args.length - 1]; // last arg is host
      const extra = args.slice(0, -1);
      sessionRegistry.openSsh(target, extra);
      setActiveSessionLabel(sessionRegistry.active.info.label);
      showNotification(`Opened ssh session: ${target}`, 'success');
      return;
    }

    // Run the command in the active session
    const session = sessionRegistry.active;
    const runId = `bash_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    // Show a "running" placeholder
    setBashRuns(prev => [...prev, {
      id: runId,
      command: cmd,
      sessionLabel: session.info.label,
      output: '...',
      exitCode: 0,
      durationMs: 0,
    }]);

    const result = await session.run(cmd);
    setBashRuns(prev => prev.map(r => r.id === runId ? {
      ...r,
      output: result.output,
      exitCode: result.exitCode,
      durationMs: result.durationMs,
    } : r));
  }, [showNotification]);

  const handleSubmit = useCallback(
    (value: string) => {
      // Bash mode: ! prefix runs in active shell session
      if (value.startsWith('!')) {
        handleBashLine(value.slice(1));
        setInputHistory(prev => [value, ...prev.slice(0, 50)]);
        return;
      }

      // Slash commands
      if (value.startsWith('/')) {
        executeCommand(value);
        return;
      }

      setInputHistory(prev => [value, ...prev.slice(0, 50)]);

      // If a turn is in flight, queue this message instead of dropping or
      // racing it. The drain effect below will dispatch it when ready.
      if (isLoading) {
        setQueuedMessages(prev => [...prev, value]);
        showNotification(`Queued (${queuedMessages.length + 1})`, 'info');
        return;
      }

      startTimeRef.current = Date.now();
      setResponseTime(undefined);

      expandMentions(value, getWorkspace().cwd).then(expanded => {
        if (expanded.attachments.length > 0) {
          showNotification(formatAttachmentSummary(expanded.attachments), 'success');
        }
        for (const err of expanded.errors) {
          showNotification(err, 'error');
        }
        sendMessage(expanded.content);
      });
    },
    [sendMessage, executeCommand, handleBashLine, showNotification, isLoading, queuedMessages.length]
  );

  // Drain queued messages when the current turn finishes.
  useEffect(() => {
    if (isLoading || queuedMessages.length === 0) return;
    const [next, ...rest] = queuedMessages;
    setQueuedMessages(rest);
    startTimeRef.current = Date.now();
    setResponseTime(undefined);
    expandMentions(next, getWorkspace().cwd).then(expanded => {
      if (expanded.attachments.length > 0) {
        showNotification(formatAttachmentSummary(expanded.attachments), 'success');
      }
      for (const err of expanded.errors) {
        showNotification(err, 'error');
      }
      sendMessage(expanded.content);
    });
  }, [isLoading, queuedMessages, sendMessage, showNotification]);

  const handleSessionSelect = useCallback(async (sessionId: string) => {
    const session = await loadSession(sessionId);
    if (session) {
      setCurrentSession(session);
      setMessages(session.messages);
      setToolStates({});
      setBashRuns([]);
      showNotification(`Loaded: ${session.name}`, 'success');
    }
  }, [showNotification, setMessages]);

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
        {/* Welcome screen — only when no conversation yet */}
        {messages.filter(m => m.role !== 'system').length === 0 && !isLoading && (
          <WelcomeScreen
            providerName={providerName}
            modelName={modelName}
          />
        )}

        {(() => {
          // Single source of truth: every visible turn comes from `messages`.
          // The streaming assistant message is the most-recent assistant entry
          // with `streaming: true` — it lives at its final position from the
          // first byte and never reflows.
          const lastAssistantIdx = (() => {
            for (let i = messages.length - 1; i >= 0; i--) {
              if (messages[i].role === 'assistant') return i;
            }
            return -1;
          })();

          // Aggregate tool calls across every assistant message in the most
          // recent user turn so the closing summary covers multi-iteration
          // turns (model goes tools → reasoning → done).
          const lastUserIdx = (() => {
            for (let i = messages.length - 1; i >= 0; i--) {
              if (messages[i].role === 'user') return i;
            }
            return -1;
          })();
          const turnToolCalls = (() => {
            if (lastUserIdx < 0) return undefined;
            const acc: typeof messages[number]['toolCalls'] = [];
            for (let i = lastUserIdx + 1; i < messages.length; i++) {
              const m = messages[i];
              if (m.role === 'assistant' && m.toolCalls?.length) {
                for (const tc of m.toolCalls) acc!.push(tc);
              }
            }
            return acc!.length > 0 ? acc : undefined;
          })();

          const visible: React.ReactNode[] = [];
          let lastVisibleRole: string | null = null;
          let key = 0;

          messages.forEach((message, i) => {
            if (message.role === 'tool' || message.role === 'system') return;
            // Synthetic continue prompts render as a tiny one-line breadcrumb
            // instead of a full "you" bubble — they're argo's own scaffolding,
            // not something the user typed.
            if (message.auto) {
              visible.push(
                <Box key={`auto${key++}`} marginTop={1} paddingLeft={2}>
                  <Text color="gray" dimColor>↻ argo auto-continued the turn</Text>
                </Box>
              );
              return;
            }
            visible.push(
              <MessageBubble
                key={`m${key++}`}
                message={message}
                hideHeader={lastVisibleRole === message.role}
                showReasoning={showReasoning}
                toolStates={toolStates}
                isLatestAssistant={i === lastAssistantIdx}
                turnToolCalls={i === lastAssistantIdx ? turnToolCalls : undefined}
              />
            );
            lastVisibleRole = message.role;
          });

          // Silent-turn hint: only fires if we already auto-continued once
          // this user-turn AND the model went silent again AND the turn
          // produced no successful tool work. If anything succeeded, the
          // TurnSummary above is the confirmation — a "no follow-up" hint
          // would just contradict it.
          const lastMsg = messages[messages.length - 1];
          const sliceFromUser = (() => {
            const idx = lastUserIdx;
            return idx < 0 ? messages : messages.slice(idx);
          })();
          const alreadyAutoContinued = sliceFromUser.some(m => m.auto);
          const turnHadSuccess = (turnToolCalls ?? []).some(
            tc => toolStates[tc.id]?.status === 'success',
          );
          const silentTurn =
            !isLoading &&
            alreadyAutoContinued &&
            !turnHadSuccess &&
            lastMsg?.role === 'assistant' &&
            !lastMsg.streaming &&
            !lastMsg.content?.trim() &&
            !(lastMsg.toolCalls && lastMsg.toolCalls.length > 0) &&
            messages.slice(0, -1).some(m => m.role === 'tool');

          if (silentTurn) {
            visible.push(
              <Box key="silent-turn" paddingLeft={2} marginTop={1}>
                <Text color="gray" dimColor>
                  ◌ no follow-up text — the model returned an empty turn. Try /continue or /retry.
                </Text>
              </Box>,
            );
          }
          return visible;
        })()}

        {/* Bash command outputs (from ! prefix) */}
        {bashRuns.map(run => (
          <BashOutput key={run.id} run={run} />
        ))}

        {/* Live sub-agent runs */}
        <AgentRunPanel />

        {/* Inline code suggestions */}
        {!isLoading && suggestions.length > 0 && (
          <SuggestionsPanel suggestions={suggestions} activeIndex={activeSuggestion} />
        )}

        {/* Error display */}
        {error && (
          <Box paddingLeft={2} marginTop={1}>
            <Text color="red">● {error}</Text>
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

      {/* Preflight Panel */}
      <PreflightPanel
        isOpen={showPreflightPanel}
        onClose={() => setShowPreflightPanel(false)}
        provider={provider}
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

      {/* Help panel */}
      {showHelp && (
        <Box flexDirection="column" borderStyle="round" borderColor="cyan" padding={1} marginY={1}>
          <Box marginBottom={1}>
            <Text color="cyan" bold>? help</Text>
            <Text color="gray" dimColor> · Esc / Enter / q to close</Text>
          </Box>
          <Text color="white" bold>Keys</Text>
          <Text color="gray">  ^P  command palette</Text>
          <Text color="gray">  ^O  sessions</Text>
          <Text color="gray">  ^S  skills + agents</Text>
          <Text color="gray">  ^R  providers</Text>
          <Text color="gray">  ^L  clear conversation</Text>
          <Text color="gray">  ^K  copy last code block</Text>
          <Text color="gray">  ^J / ^F   cycle / apply suggestion</Text>
          <Text color="gray">  ^T  show / hide reasoning for past turns</Text>
          <Text color="gray">  Tab collapse thinking panel</Text>
          <Text color="gray">  Esc interrupt the running turn</Text>
          <Text color="gray">  ^C  abort / exit</Text>
          <Box marginTop={1}>
            <Text color="white" bold>Prefixes</Text>
          </Box>
          <Text color="gray">  /...  slash commands (^P to browse)</Text>
          <Text color="gray">  !...  run in active shell session  (!ssh user@host opens remote)</Text>
          <Text color="gray">  @path attach a file to the next message</Text>
        </Box>
      )}

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
      <Box marginTop={1} flexDirection="column">
        {queuedMessages.length > 0 && (
          <Box paddingX={1}>
            <Text color="yellow" dimColor>
              ⏳ {queuedMessages.length} queued · Esc to cancel
            </Text>
          </Box>
        )}
        <Input
          onSubmit={handleSubmit}
          placeholder={isLoading ? 'Type to queue · Esc to interrupt' : 'Ask me anything... (Ctrl+P for commands)'}
          disabled={!!confirmPrompt || showCommandPalette || showSessionPicker || showSkillsPanel || showProvidersPanel || showPreflightPanel || showHelp}
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
        sessionLabel={activeSessionLabel}
        lastTokensPerSec={lastTokensPerSec}
      />
    </Box>
  );
}

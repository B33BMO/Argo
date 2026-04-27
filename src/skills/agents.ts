// Sub-agent system - spawn focused agents for specific tasks
import type { LLMProvider, Message, ToolCall } from '../providers/types.js';
import type { ToolContext } from '../tools/types.js';
import type { AgentDefinition, AgentInvocation, AgentResult } from './types.js';
import { toolRegistry } from '../tools/registry.js';

// Built-in agent definitions
export const BUILTIN_AGENTS: Record<string, AgentDefinition> = {
  explorer: {
    name: 'explorer',
    description: 'Search and explore the codebase. Returns findings without making changes.',
    systemPrompt: `You are a code exploration agent. Your job is to search and explore codebases efficiently.

Rules:
- Use glob, grep, list_dir, and read_file tools to find what's needed
- DO NOT modify files - you are read-only
- Return concise findings with file paths and line numbers
- Be thorough but report briefly`,
    tools: ['glob', 'grep', 'list_dir', 'read_file'],
    maxIterations: 15,
  },

  coder: {
    name: 'coder',
    description: 'Implement features and fix bugs. Can read and write files.',
    systemPrompt: `You are a code implementation agent. Your job is to write and modify code.

Rules:
- Read existing code first to understand patterns
- Make minimal, focused changes
- Don't add features beyond what's asked
- Test your changes when possible`,
    tools: ['read_file', 'write_file', 'edit_file', 'glob', 'grep', 'list_dir', 'bash'],
    maxIterations: 25,
  },

  reviewer: {
    name: 'reviewer',
    description: 'Review code for bugs, security issues, and quality. Read-only.',
    systemPrompt: `You are a code review agent. Your job is to find issues and suggest improvements.

Rules:
- Look for: bugs, security issues, performance problems, code smells
- Check tests exist and are meaningful
- DO NOT make changes - only report findings
- Use file_path:line_number format for references`,
    tools: ['read_file', 'glob', 'grep', 'list_dir', 'bash'],
    maxIterations: 15,
  },

  researcher: {
    name: 'researcher',
    description: 'Research information using web and local files.',
    systemPrompt: `You are a research agent. Gather information from web and files.

Rules:
- Use curl for web requests
- Use file tools for local research
- Synthesize findings into clear summaries
- Cite sources (URLs and file paths)`,
    tools: ['curl', 'read_file', 'glob', 'grep'],
    maxIterations: 10,
  },

  debugger: {
    name: 'debugger',
    description: 'Investigate and diagnose bugs. Run commands to reproduce issues.',
    systemPrompt: `You are a debugging agent. Find root causes of issues.

Rules:
- Reproduce the issue first
- Read relevant code paths
- Check logs and error output
- Identify root cause before suggesting fixes
- Be systematic - don't guess`,
    tools: ['bash', 'read_file', 'glob', 'grep', 'list_dir'],
    maxIterations: 20,
  },
};

// Event types emitted during an agent run
export type AgentEvent =
  | { type: 'start'; runId: string; agentName: string; task: string }
  | { type: 'iteration'; runId: string; iteration: number }
  | { type: 'tool_call'; runId: string; toolName: string; args: Record<string, unknown> }
  | { type: 'tool_result'; runId: string; toolName: string; success: boolean }
  | { type: 'text'; runId: string; content: string }
  | { type: 'done'; runId: string; result: AgentResult };

// Global event listeners — UI subscribes to these
type Listener = (event: AgentEvent) => void;
const listeners: Set<Listener> = new Set();

export function subscribeToAgentEvents(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(event: AgentEvent) {
  for (const fn of listeners) {
    try { fn(event); } catch { /* swallow listener errors */ }
  }
}

let runIdCounter = 0;
function nextRunId(): string {
  return `agent_${Date.now()}_${++runIdCounter}`;
}

export class AgentRunner {
  constructor(private provider: LLMProvider) {}

  async run(
    agent: AgentDefinition,
    invocation: AgentInvocation,
    context: ToolContext
  ): Promise<AgentResult> {
    const runId = nextRunId();
    const startTime = Date.now();
    const toolsUsed = new Set<string>();

    emit({ type: 'start', runId, agentName: agent.name, task: invocation.task });

    const allTools = toolRegistry.getAll();
    const availableTools = agent.tools
      ? allTools.filter(t => agent.tools!.includes(t.name))
      : allTools;

    const messages: Message[] = [
      {
        role: 'user',
        content: invocation.context
          ? `${invocation.task}\n\nContext:\n${invocation.context}`
          : invocation.task,
      },
    ];

    let iterations = 0;
    const maxIterations = agent.maxIterations || 20;
    let finalOutput = '';

    try {
      while (iterations < maxIterations) {
        iterations++;
        emit({ type: 'iteration', runId, iteration: iterations });

        let response = '';
        const toolCalls: ToolCall[] = [];

        for await (const chunk of this.provider.chat(messages, {
          systemPrompt: agent.systemPrompt,
          tools: availableTools,
        })) {
          if (chunk.type === 'text' && chunk.content) {
            response += chunk.content;
            emit({ type: 'text', runId, content: chunk.content });
          } else if (chunk.type === 'tool_call' && chunk.toolCall) {
            toolCalls.push(chunk.toolCall);
          } else if (chunk.type === 'error') {
            throw new Error(chunk.error || 'Provider error');
          }
        }

        if (toolCalls.length === 0) {
          finalOutput = response;
          break;
        }

        messages.push({
          role: 'assistant',
          content: response,
          toolCalls,
        });

        // Execute tool calls in PARALLEL
        const toolResults = await Promise.all(
          toolCalls.map(async (tc) => {
            toolsUsed.add(tc.name);
            emit({ type: 'tool_call', runId, toolName: tc.name, args: tc.arguments });

            const tool = toolRegistry.get(tc.name);
            if (!tool) {
              emit({ type: 'tool_result', runId, toolName: tc.name, success: false });
              return {
                role: 'tool' as const,
                content: `Error: Tool '${tc.name}' not found`,
                toolCallId: tc.id,
              };
            }

            try {
              const result = await tool.execute(tc.arguments, context);
              emit({ type: 'tool_result', runId, toolName: tc.name, success: result.success });
              return {
                role: 'tool' as const,
                content: result.success ? (result.output || 'Success') : `Error: ${result.error}`,
                toolCallId: tc.id,
              };
            } catch (error) {
              emit({ type: 'tool_result', runId, toolName: tc.name, success: false });
              return {
                role: 'tool' as const,
                content: `Error: ${error instanceof Error ? error.message : String(error)}`,
                toolCallId: tc.id,
              };
            }
          })
        );

        messages.push(...toolResults);
      }

      const result: AgentResult = {
        agentName: agent.name,
        task: invocation.task,
        output: finalOutput || '(Agent reached max iterations)',
        toolsUsed: Array.from(toolsUsed),
        duration: Date.now() - startTime,
        success: true,
      };
      emit({ type: 'done', runId, result });
      return result;
    } catch (error) {
      const result: AgentResult = {
        agentName: agent.name,
        task: invocation.task,
        output: finalOutput,
        toolsUsed: Array.from(toolsUsed),
        duration: Date.now() - startTime,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
      emit({ type: 'done', runId, result });
      return result;
    }
  }
}

export function getAgent(name: string): AgentDefinition | undefined {
  return BUILTIN_AGENTS[name.toLowerCase()];
}

export function listAgents(): AgentDefinition[] {
  return Object.values(BUILTIN_AGENTS);
}

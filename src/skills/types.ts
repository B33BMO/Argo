// Skills and Agents type system
import type { Tool } from '../tools/types.js';

export interface SkillFrontmatter {
  name: string;
  description: string;
  triggers?: string[]; // Keywords/patterns that activate this skill
  tools?: string[]; // Tool names this skill needs access to
  model?: string; // Optional model override
  version?: string;
}

export interface Skill {
  frontmatter: SkillFrontmatter;
  body: string; // The skill instructions/prompt
  filePath: string;
}

export interface AgentDefinition {
  name: string;
  description: string;
  systemPrompt: string;
  tools?: string[]; // Restricted tool list (undefined = all)
  model?: string;
  maxIterations?: number;
}

export interface AgentInvocation {
  agentName: string;
  task: string;
  context?: string;
}

export interface AgentResult {
  agentName: string;
  task: string;
  output: string;
  toolsUsed: string[];
  duration: number;
  success: boolean;
  error?: string;
}

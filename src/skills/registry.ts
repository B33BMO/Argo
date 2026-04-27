// Skill discovery and registry
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type { Skill, SkillFrontmatter } from './types.js';

const USER_SKILLS_DIR = path.join(os.homedir(), '.roo', 'skills');
const PROJECT_SKILLS_DIR = '.roo/skills';

class SkillRegistry {
  private skills: Map<string, Skill> = new Map();
  private loaded = false;

  async load(cwd: string = process.cwd()): Promise<void> {
    this.skills.clear();

    // Load user-level skills
    await this.loadFromDirectory(USER_SKILLS_DIR);

    // Load project-level skills (override user skills)
    await this.loadFromDirectory(path.join(cwd, PROJECT_SKILLS_DIR));

    this.loaded = true;
  }

  private async loadFromDirectory(dir: string): Promise<void> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          // Skill in directory: <dir>/SKILL.md
          const skillPath = path.join(dir, entry.name, 'SKILL.md');
          await this.loadSkillFile(skillPath);
        } else if (entry.name.endsWith('.md')) {
          // Skill as single file: <dir>/<name>.md
          await this.loadSkillFile(path.join(dir, entry.name));
        }
      }
    } catch {
      // Directory doesn't exist - that's fine
    }
  }

  private async loadSkillFile(filePath: string): Promise<void> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const skill = parseSkill(content, filePath);

      if (skill) {
        this.skills.set(skill.frontmatter.name, skill);
      }
    } catch {
      // Invalid file - skip
    }
  }

  get(name: string): Skill | undefined {
    return this.skills.get(name);
  }

  list(): Skill[] {
    return Array.from(this.skills.values());
  }

  // Find skills that match the user's input via triggers
  match(userInput: string): Skill[] {
    const lowerInput = userInput.toLowerCase();
    const matches: { skill: Skill; score: number }[] = [];

    for (const skill of this.skills.values()) {
      let score = 0;

      // Check explicit /skill-name invocation
      if (lowerInput.startsWith(`/${skill.frontmatter.name.toLowerCase()}`)) {
        score = 1000;
      }

      // Check trigger keywords
      if (skill.frontmatter.triggers) {
        for (const trigger of skill.frontmatter.triggers) {
          if (lowerInput.includes(trigger.toLowerCase())) {
            score += 10;
          }
        }
      }

      // Check description match
      const descWords = skill.frontmatter.description.toLowerCase().split(/\s+/);
      const inputWords = lowerInput.split(/\s+/);
      const overlap = descWords.filter(w => inputWords.includes(w)).length;
      score += overlap;

      if (score > 0) {
        matches.push({ skill, score });
      }
    }

    return matches
      .sort((a, b) => b.score - a.score)
      .map(m => m.skill);
  }

  isLoaded(): boolean {
    return this.loaded;
  }
}

export const skillRegistry = new SkillRegistry();

// Parse a skill markdown file with YAML frontmatter
export function parseSkill(content: string, filePath: string): Skill | null {
  // Match YAML frontmatter between --- delimiters
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);

  if (!frontmatterMatch) {
    return null;
  }

  const [, frontmatterText, body] = frontmatterMatch;
  const frontmatter = parseYamlFrontmatter(frontmatterText);

  if (!frontmatter || !frontmatter.name || !frontmatter.description) {
    return null;
  }

  return {
    frontmatter: frontmatter as SkillFrontmatter,
    body: body.trim(),
    filePath,
  };
}

// Simple YAML frontmatter parser (no external deps for this)
function parseYamlFrontmatter(text: string): Partial<SkillFrontmatter> | null {
  const result: any = {};
  const lines = text.split('\n');

  let currentKey: string | null = null;
  let currentList: string[] | null = null;

  for (const line of lines) {
    if (!line.trim()) continue;

    // List item
    if (line.match(/^\s+-\s+/)) {
      if (currentList && currentKey) {
        const value = line.replace(/^\s+-\s+/, '').trim().replace(/^["']|["']$/g, '');
        currentList.push(value);
      }
      continue;
    }

    // Key-value pair
    const match = line.match(/^(\w+):\s*(.*)$/);
    if (match) {
      const [, key, value] = match;
      currentKey = key;

      if (!value) {
        // Multi-line value (list)
        currentList = [];
        result[key] = currentList;
      } else {
        currentList = null;
        // Strip quotes
        result[key] = value.trim().replace(/^["']|["']$/g, '');
      }
    }
  }

  return result;
}

// Create a skill template for users
export async function createSkillTemplate(
  name: string,
  description: string,
  cwd: string = process.cwd()
): Promise<string> {
  const skillsDir = path.join(cwd, PROJECT_SKILLS_DIR);
  await fs.mkdir(skillsDir, { recursive: true });

  const filePath = path.join(skillsDir, `${name}.md`);

  const template = `---
name: ${name}
description: ${description}
triggers:
  - example-keyword
tools:
  - bash
  - read_file
---

# ${name}

You are a specialized skill for ${description}.

## When to use this skill

Activate when the user asks about ${description}.

## Instructions

1. First step
2. Second step
3. Third step

## Examples

Example user input: "..."
Expected behavior: "..."
`;

  await fs.writeFile(filePath, template, 'utf-8');
  return filePath;
}

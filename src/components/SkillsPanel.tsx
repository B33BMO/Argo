import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { icon } from '../utils/icons.js';
import { skillRegistry } from '../skills/registry.js';
import { listAgents } from '../skills/agents.js';
import type { Skill, AgentDefinition } from '../skills/types.js';

interface SkillsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectSkill?: (skill: Skill) => void;
}

export function SkillsPanel({ isOpen, onClose, onSelectSkill }: SkillsPanelProps) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [agents] = useState<AgentDefinition[]>(listAgents());
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [tab, setTab] = useState<'skills' | 'agents'>('skills');

  useEffect(() => {
    if (!isOpen) return;
    skillRegistry.load().then(() => {
      setSkills(skillRegistry.list());
    });
  }, [isOpen]);

  const items = tab === 'skills' ? skills : agents;

  useInput((input, key) => {
    if (!isOpen) return;

    if (key.escape) {
      onClose();
      return;
    }

    if (key.tab) {
      setTab(t => t === 'skills' ? 'agents' : 'skills');
      setSelectedIndex(0);
      return;
    }

    if (key.upArrow) {
      setSelectedIndex(i => Math.max(0, i - 1));
      return;
    }

    if (key.downArrow) {
      setSelectedIndex(i => Math.min(items.length - 1, i + 1));
      return;
    }

    if (key.return && tab === 'skills' && skills[selectedIndex] && onSelectSkill) {
      onSelectSkill(skills[selectedIndex]);
      onClose();
    }
  }, { isActive: isOpen });

  if (!isOpen) return null;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="magenta"
      padding={1}
      marginY={1}
    >
      {/* Tabs */}
      <Box marginBottom={1}>
        <Text color={tab === 'skills' ? 'magenta' : 'gray'} bold={tab === 'skills'}>
          {icon('star')} Skills ({skills.length})
        </Text>
        <Text color="gray"> │ </Text>
        <Text color={tab === 'agents' ? 'magenta' : 'gray'} bold={tab === 'agents'}>
          {icon('bolt')} Agents ({agents.length})
        </Text>
      </Box>

      <Text color="gray">{'─'.repeat(50)}</Text>

      {/* List */}
      <Box flexDirection="column" marginTop={1}>
        {items.length === 0 ? (
          <Text color="gray" dimColor>
            {tab === 'skills'
              ? 'No skills found. Create one in ~/.roo/skills/'
              : 'No agents available'}
          </Text>
        ) : tab === 'skills' ? (
          (items as Skill[]).map((skill, i) => (
            <SkillItem
              key={skill.frontmatter.name}
              skill={skill}
              isSelected={i === selectedIndex}
            />
          ))
        ) : (
          (items as AgentDefinition[]).map((agent, i) => (
            <AgentItem
              key={agent.name}
              agent={agent}
              isSelected={i === selectedIndex}
            />
          ))
        )}
      </Box>

      {/* Help */}
      <Box marginTop={1}>
        <Text color="gray" dimColor>
          ↑↓ navigate · Tab switch · Enter select · Esc close
        </Text>
      </Box>
    </Box>
  );
}

function SkillItem({ skill, isSelected }: { skill: Skill; isSelected: boolean }) {
  return (
    <Box flexDirection="column">
      <Box>
        <Text color={isSelected ? 'magenta' : 'white'}>
          {isSelected ? icon('chevronRight') + ' ' : '  '}
        </Text>
        <Text color={isSelected ? 'magenta' : 'cyan'} bold={isSelected}>
          /{skill.frontmatter.name}
        </Text>
        {skill.frontmatter.tools && (
          <Text color="gray" dimColor>
            {' '}[{skill.frontmatter.tools.join(', ')}]
          </Text>
        )}
      </Box>
      <Box marginLeft={4}>
        <Text color="gray" dimColor wrap="truncate">
          {skill.frontmatter.description}
        </Text>
      </Box>
    </Box>
  );
}

function AgentItem({ agent, isSelected }: { agent: AgentDefinition; isSelected: boolean }) {
  return (
    <Box flexDirection="column">
      <Box>
        <Text color={isSelected ? 'magenta' : 'white'}>
          {isSelected ? icon('chevronRight') + ' ' : '  '}
        </Text>
        <Text color={isSelected ? 'magenta' : 'yellow'} bold={isSelected}>
          @{agent.name}
        </Text>
        <Text color="gray" dimColor>
          {' '}({agent.tools?.length || 'all'} tools)
        </Text>
      </Box>
      <Box marginLeft={4}>
        <Text color="gray" dimColor wrap="truncate">
          {agent.description}
        </Text>
      </Box>
    </Box>
  );
}

// Skill activation banner - shown when a skill is being used
interface SkillBadgeProps {
  skillName: string;
}

export function SkillBadge({ skillName }: SkillBadgeProps) {
  return (
    <Box>
      <Text color="magenta">{icon('star')} </Text>
      <Text color="magenta" bold>using skill: </Text>
      <Text color="cyan">{skillName}</Text>
    </Box>
  );
}

// Agent invocation indicator
interface AgentBadgeProps {
  agentName: string;
  status: 'starting' | 'running' | 'done' | 'error';
  duration?: number;
}

export function AgentBadge({ agentName, status, duration }: AgentBadgeProps) {
  const statusConfig = {
    starting: { color: 'gray', label: 'starting' },
    running: { color: 'yellow', label: 'running' },
    done: { color: 'green', label: 'completed' },
    error: { color: 'red', label: 'failed' },
  };

  const config = statusConfig[status];

  return (
    <Box>
      <Text color={config.color as any}>{icon('bolt')} </Text>
      <Text color="yellow" bold>@{agentName}</Text>
      <Text color="gray"> · </Text>
      <Text color={config.color as any}>{config.label}</Text>
      {duration !== undefined && (
        <Text color="gray" dimColor>
          {' '}({(duration / 1000).toFixed(1)}s)
        </Text>
      )}
    </Box>
  );
}

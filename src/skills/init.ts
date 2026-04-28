// /init — explore the project and write argo.md (a project-level briefing
// that future Argo conversations can rely on alongside .argo/memory.md).
import * as fs from 'fs/promises';
import * as path from 'path';
import { AgentRunner, getAgent } from './agents.js';
import { getWorkspace } from '../utils/workspace.js';
import type { LLMProvider } from '../providers/types.js';
import type { ToolContext } from '../tools/types.js';

const INIT_PROMPT = `Explore this project and produce a single self-contained markdown document.

Use list_dir, glob, read_file, and grep liberally. Read the package manifest (package.json / pyproject.toml / Cargo.toml / go.mod / etc.), the README if present, and a representative slice of source code so you can speak credibly about the architecture.

NEVER read \`.env\`, \`.env.*\`, files under \`.ssh\`/\`.aws\`/\`.gcloud\`/\`.azure\`/\`.kube\`, anything named \`credentials\`/\`secrets\`/\`*.pem\`/\`*.key\`, or any private-key file. The tools will refuse anyway, but don't try. If you spot one, just note its existence in "Notable conventions" — never quote its contents.

Then write your output as the FULL markdown content of argo.md. Do not wrap it in code fences. Do not preface with "here is the markdown" or "I'll write...". Your entire final assistant message must BE the file contents — starting with the # heading and ending with the last line of prose.

Use this structure:

# <Project Name>

> One-sentence elevator pitch.

## Stack
Bullet list of languages, frameworks, runtimes, build tools.

## Architecture
2–4 paragraphs describing how the pieces fit together. Reference specific files with file:line where it sharpens the point.

## Entry points
Bullet list of \`path/to/file\` — what runs when you launch / build / test.

## Notable conventions
Anything that surprised you or that a contributor would otherwise have to discover by trial. Skip the obvious.

## Gotchas
Bugs, half-finished features, or fragile spots that you found while reading.

## How to run
The fewest commands needed to build, run, and test, copy-pasted from the actual project config.
`;

export async function runInit(
  provider: LLMProvider,
  context: ToolContext
): Promise<{ path: string; bytes: number }> {
  const explorer = getAgent('explorer');
  if (!explorer) throw new Error('explorer agent missing');

  const runner = new AgentRunner(provider);
  const result = await runner.run(
    {
      ...explorer,
      maxIterations: 30,
      systemPrompt:
        explorer.systemPrompt +
        '\n\nFor this task you may produce long-form prose — your final message becomes a markdown file.',
    },
    { agentName: 'explorer', task: INIT_PROMPT },
    context
  );

  if (!result.success || !result.output.trim()) {
    throw new Error(result.error || 'explorer returned no output');
  }

  const target = path.join(getWorkspace().cwd, 'argo.md');
  await fs.writeFile(target, result.output.trim() + '\n', 'utf-8');
  return { path: target, bytes: result.output.length };
}

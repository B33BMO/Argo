// Render a few ToolCallCard variants with diff blocks so we can eyeball the
// visual treatment without firing up a real LLM turn.
//
//   npm run smoke -- diff
import React from 'react';
import { render } from 'ink-testing-library';
import { Box, Text } from 'ink';
import { ToolCallCard } from '../components/ToolCallCard.js';

function stripAnsi(s: string): string {
  return s
    .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\x1B\][^\x07]*\x07/g, '')
    .replace(/\x1B[()][A-Z0-9]/g, '');
}

const oldFile = `import { foo } from './foo';
import { bar } from './bar';

export function greet(name: string) {
  return 'hi ' + name;
}

export function farewell(name: string) {
  return 'bye ' + name;
}
`;

const newFile = `import { foo } from './foo';
import { bar } from './bar';
import { baz } from './baz';

export function greet(name: string): string {
  return \`hi \${name}\`;
}

export function farewell(name: string) {
  return 'bye ' + name;
}
`;

const Preview: React.FC = () => (
  <Box flexDirection="column">
    <Text color="cyan" bold>── edit_file (small replace) ──</Text>
    <ToolCallCard
      name="edit_file"
      arguments={{
        path: 'src/utils/greet.ts',
        old_string: "  return 'hi ' + name;",
        new_string: '  return `hi ${name}`;',
      }}
      status="success"
    />

    <Text color="cyan" bold>{'\n'}── write_file (existing file, real diff) ──</Text>
    <ToolCallCard
      name="write_file"
      arguments={{ path: 'src/utils/greet.ts', content: newFile }}
      status="success"
      metadata={{ priorContent: oldFile, newContent: newFile, isNewFile: false }}
    />

    <Text color="cyan" bold>{'\n'}── write_file (new file) ──</Text>
    <ToolCallCard
      name="write_file"
      arguments={{ path: 'src/utils/baz.ts', content: 'export const BAZ = 42;\nexport const QUUX = 7;\n' }}
      status="success"
      metadata={{
        priorContent: '',
        newContent: 'export const BAZ = 42;\nexport const QUUX = 7;\n',
        isNewFile: true,
      }}
    />

    <Text color="cyan" bold>{'\n'}── edit_file (running) ──</Text>
    <ToolCallCard
      name="edit_file"
      arguments={{ path: 'src/foo.ts', old_string: 'a', new_string: 'b' }}
      status="running"
    />

    <Text color="cyan" bold>{'\n'}── edit_file (error) ──</Text>
    <ToolCallCard
      name="edit_file"
      arguments={{ path: 'src/foo.ts', old_string: 'a', new_string: 'b' }}
      status="error"
      error="String not found in file: a"
    />

    <Text color="cyan" bold>{'\n'}── unrelated tool (no diff) ──</Text>
    <ToolCallCard
      name="bash"
      arguments={{ command: 'ls -la src/' }}
      status="success"
    />
  </Box>
);

export async function runDiffPreview(opts: { raw: boolean }): Promise<number> {
  const { lastFrame, unmount } = render(<Preview />);
  await new Promise(r => setTimeout(r, 50));
  const frame = lastFrame() ?? '';
  process.stdout.write('\n──── diff preview ────\n');
  process.stdout.write(opts.raw ? frame : stripAnsi(frame));
  process.stdout.write('\n──── end ────\n');
  unmount();
  return 0;
}

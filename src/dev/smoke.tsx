// Headless smoke harness for Argo's UI.
//
//   npm run smoke -- <scenario>                       # mock-driven scenario
//   npm run smoke -- <scenario> --raw                 # keep ANSI escapes
//   npm run smoke -- list                             # list scenarios
//   npm run smoke -- real "<prompt>"                  # use the active provider
//   npm run smoke -- real "<prompt>" --provider=<id>  # specific provider id
//   npm run smoke -- real "<prompt>" --duration=20000 # run for N ms
//
// Mock mode: scenarios in src/dev/scenarios/ define a scripted stream, when
// to type input, and when to snapshot. Real mode: same UI harness, but the
// provider is built from ~/.argo/providers.yaml so the actual model drives
// the run. In both modes we mount <App /> via ink-testing-library and dump
// lastFrame() at each snapshot offset (ANSI-stripped by default).
import React from 'react';
import { render } from 'ink-testing-library';
import { App } from '../app.js';
import { createMockProvider } from './mock-provider.js';
import { SCENARIOS, type Scenario } from './scenarios/index.js';
import { runWelcomePreview } from './welcome-preview.js';
import { runDiffPreview } from './diff-preview.js';
import {
  loadProviders,
  buildProvider,
  type ProviderConfig,
} from '../providers/manager.js';
import type { LLMProvider } from '../providers/types.js';

function stripAnsi(s: string): string {
  // Minimal ANSI stripper — covers CSI / OSC / SGR sequences.
  return s
    .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\x1B\][^\x07]*\x07/g, '')
    .replace(/\x1B[()][A-Z0-9]/g, '');
}

function banner(title: string): string {
  return `\n${'═'.repeat(8)} ${title} ${'═'.repeat(Math.max(0, 60 - title.length))}\n`;
}

async function runScenario(scenarioName: string, opts: { raw: boolean }): Promise<number> {
  const scenario: Scenario | undefined = SCENARIOS[scenarioName];
  if (!scenario) {
    console.error(`Unknown scenario: ${scenarioName}`);
    console.error(`Available: ${Object.keys(SCENARIOS).join(', ')}`);
    return 2;
  }

  const provider = createMockProvider({
    scripts: scenario.scripts,
    baseDelayMs: 6,
    name: 'mock',
  });

  process.stdout.write(banner(`scenario: ${scenario.name}`));
  process.stdout.write(`${scenario.description}\n`);
  process.stdout.write(`user input: ${JSON.stringify(scenario.userInput)}\n`);

  const ui = render(
    <App
      provider={provider}
      providerName="mock"
      modelName="mock-7b"
      soundEnabled={false}
    />,
  );

  const start = Date.now();

  // Type the initial user message after the welcome screen has settled.
  // ink-testing-library's stdin.write feeds raw input bytes — the App's
  // <Input> receives each char, then \r submits.
  setTimeout(() => {
    ui.stdin.write(scenario.userInput);
    setTimeout(() => ui.stdin.write('\r'), 30);
  }, 80);

  for (const [delayMs, text] of scenario.laterInputs ?? []) {
    setTimeout(() => {
      ui.stdin.write(text);
      setTimeout(() => ui.stdin.write('\r'), 30);
    }, delayMs);
  }

  const snapshots = scenario.snapshotsAtMs ?? [400, 1200, 2400, 3600];
  const captures: Array<{ at: number; frame: string }> = [];

  for (const at of snapshots) {
    setTimeout(() => {
      const frame = ui.lastFrame() ?? '';
      captures.push({ at, frame });
    }, at);
  }

  const duration = scenario.durationMs ?? Math.max(...snapshots) + 600;
  await new Promise(r => setTimeout(r, duration));

  ui.unmount();

  for (const cap of captures) {
    process.stdout.write(banner(`t=${cap.at}ms (Δ ${Date.now() - start}ms)`));
    process.stdout.write(opts.raw ? cap.frame : stripAnsi(cap.frame));
    process.stdout.write('\n');
  }

  process.stdout.write(banner('END'));
  return 0;
}

function parseFlag(args: string[], name: string): string | undefined {
  for (const a of args) {
    if (a === `--${name}`) return ''; // bare flag
    if (a.startsWith(`--${name}=`)) return a.slice(name.length + 3);
  }
  return undefined;
}

async function runReal(
  prompt: string,
  opts: { raw: boolean; providerId?: string; durationMs: number; snapshotEveryMs: number },
): Promise<number> {
  const file = await loadProviders();
  const cfg: ProviderConfig | undefined = opts.providerId
    ? file.providers.find(p => p.id === opts.providerId)
    : file.providers.find(p => p.id === file.active) ?? file.providers[0];

  if (!cfg) {
    console.error('No provider configured. Configure one with `argo` first.');
    return 2;
  }

  const provider: LLMProvider = buildProvider(cfg);

  process.stdout.write(banner(`real-mode: ${cfg.label} (${cfg.id})`));
  process.stdout.write(`baseUrl: ${cfg.baseUrl}\n`);
  process.stdout.write(`model:   ${cfg.defaultModel ?? '(provider default)'}\n`);
  process.stdout.write(`prompt:  ${JSON.stringify(prompt)}\n`);
  process.stdout.write(`running for ${opts.durationMs}ms, snapshot every ${opts.snapshotEveryMs}ms\n`);

  const ui = render(
    <App
      provider={provider}
      providerName={cfg.label}
      modelName={cfg.defaultModel ?? 'unknown'}
      soundEnabled={false}
    />,
  );

  const start = Date.now();

  setTimeout(() => {
    ui.stdin.write(prompt);
    setTimeout(() => ui.stdin.write('\r'), 30);
  }, 80);

  const captures: Array<{ at: number; frame: string }> = [];
  let next = opts.snapshotEveryMs;
  while (next < opts.durationMs) {
    const at = next;
    setTimeout(() => {
      captures.push({ at, frame: ui.lastFrame() ?? '' });
    }, at);
    next += opts.snapshotEveryMs;
  }

  await new Promise(r => setTimeout(r, opts.durationMs));

  // Final frame
  const finalFrame = ui.lastFrame() ?? '';
  ui.unmount();

  for (const cap of captures) {
    process.stdout.write(banner(`t=${cap.at}ms (Δ ${Date.now() - start}ms)`));
    process.stdout.write(opts.raw ? cap.frame : stripAnsi(cap.frame));
    process.stdout.write('\n');
  }
  process.stdout.write(banner(`final t=${opts.durationMs}ms`));
  process.stdout.write(opts.raw ? finalFrame : stripAnsi(finalFrame));
  process.stdout.write(banner('END'));
  return 0;
}

async function main() {
  const args = process.argv.slice(2);
  const raw = args.includes('--raw');
  const positional = args.filter(a => !a.startsWith('--'));

  if (positional.length === 0 || positional[0] === 'list') {
    console.log('Mock scenarios:');
    for (const [name, sc] of Object.entries(SCENARIOS)) {
      console.log(`  ${name.padEnd(18)} ${sc.description}`);
    }
    console.log('\nReal-provider mode:');
    console.log('  npm run smoke -- real "<prompt>" [--provider=<id>] [--duration=<ms>] [--every=<ms>]');
    process.exit(0);
  }

  if (positional[0] === 'welcome') {
    const code = await runWelcomePreview({ raw });
    process.exit(code);
  }

  if (positional[0] === 'diff') {
    const code = await runDiffPreview({ raw });
    process.exit(code);
  }

  if (positional[0] === 'real') {
    const prompt = positional[1];
    if (!prompt) {
      console.error('Usage: npm run smoke -- real "<prompt>"');
      process.exit(2);
    }
    const providerId = parseFlag(args, 'provider') || undefined;
    const durationMs = Number(parseFlag(args, 'duration') || 15000);
    const snapshotEveryMs = Number(parseFlag(args, 'every') || 2500);
    const code = await runReal(prompt, { raw, providerId, durationMs, snapshotEveryMs });
    process.exit(code);
  }

  const code = await runScenario(positional[0], { raw });
  process.exit(code);
}

main().catch(err => {
  console.error('smoke harness crashed:', err);
  process.exit(1);
});

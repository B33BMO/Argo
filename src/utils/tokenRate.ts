// Tiny pub/sub token-rate tracker. useChat samples chars-streamed-per-second
// into a ring buffer; the status line subscribes and renders a sparkline.

const SAMPLES = 24; // ~12 seconds at 500ms cadence
const CHARS_PER_TOKEN = 4;

const buffer: number[] = new Array(SAMPLES).fill(0);
let listeners: Set<() => void> = new Set();

let charsThisTick = 0;
let lastFlush = Date.now();

function flush() {
  const now = Date.now();
  const dt = (now - lastFlush) / 1000;
  if (dt <= 0) return;
  const rate = charsThisTick / CHARS_PER_TOKEN / dt;
  buffer.shift();
  buffer.push(rate);
  charsThisTick = 0;
  lastFlush = now;
  for (const fn of listeners) {
    try { fn(); } catch { /* ignore */ }
  }
}

let interval: NodeJS.Timeout | null = null;

function ensureInterval() {
  if (interval) return;
  interval = setInterval(flush, 500);
  // Don't keep the process alive just for sampling
  if (typeof interval === 'object' && interval && (interval as any).unref) {
    (interval as any).unref();
  }
}

export function recordChars(n: number): void {
  ensureInterval();
  charsThisTick += n;
}

export function getSamples(): number[] {
  return buffer.slice();
}

export function getCurrentRate(): number {
  // Average of last 4 samples, ignoring zeros so trailing idle doesn't drag it down
  const recent = buffer.slice(-4).filter(x => x > 0);
  if (recent.length === 0) return 0;
  return recent.reduce((a, b) => a + b, 0) / recent.length;
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  ensureInterval();
  return () => listeners.delete(fn);
}

export function reset(): void {
  for (let i = 0; i < SAMPLES; i++) buffer[i] = 0;
  charsThisTick = 0;
  lastFlush = Date.now();
}

const SPARK_CHARS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

export function renderSparkline(samples: number[] = buffer): string {
  const max = Math.max(...samples, 1);
  return samples
    .map(v => {
      if (v <= 0) return SPARK_CHARS[0];
      const idx = Math.min(SPARK_CHARS.length - 1, Math.floor((v / max) * (SPARK_CHARS.length - 1)));
      return SPARK_CHARS[idx];
    })
    .join('');
}

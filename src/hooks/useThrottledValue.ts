import { useEffect, useState } from 'react';

/**
 * Single shared animation tick — components subscribe instead of each
 * starting their own setInterval. Massively reduces re-renders.
 */
let tickListeners: Set<() => void> = new Set();
let tickInterval: NodeJS.Timeout | null = null;
let tickCount = 0;

function ensureTick() {
  if (tickInterval) return;
  tickInterval = setInterval(() => {
    tickCount++;
    for (const fn of tickListeners) fn();
  }, 100);
}

function maybeStopTick() {
  if (tickListeners.size === 0 && tickInterval) {
    clearInterval(tickInterval);
    tickInterval = null;
  }
}

export function useAnimationTick(active = true): number {
  const [tick, setTick] = useState(tickCount);

  useEffect(() => {
    if (!active) return;
    const listener = () => setTick(tickCount);
    tickListeners.add(listener);
    ensureTick();
    return () => {
      tickListeners.delete(listener);
      maybeStopTick();
    };
  }, [active]);

  return tick;
}

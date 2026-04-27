import { useEffect, useRef, useState } from 'react';

/**
 * Throttles a fast-changing value (e.g. streaming text) to a max update rate.
 * Prevents flicker from re-rendering on every token.
 */
export function useThrottledValue<T>(value: T, intervalMs = 50): T {
  const [throttled, setThrottled] = useState(value);
  const lastUpdateRef = useRef(0);
  const pendingTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const now = Date.now();
    const elapsed = now - lastUpdateRef.current;

    if (elapsed >= intervalMs) {
      lastUpdateRef.current = now;
      setThrottled(value);
    } else {
      if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = setTimeout(() => {
        lastUpdateRef.current = Date.now();
        setThrottled(value);
      }, intervalMs - elapsed);
    }

    return () => {
      if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current);
    };
  }, [value, intervalMs]);

  return throttled;
}

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

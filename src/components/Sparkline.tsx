import React, { memo, useEffect, useState } from 'react';
import { Text } from 'ink';
import { getSamples, getCurrentRate, renderSparkline, subscribe } from '../utils/tokenRate.js';

interface SparklineProps {
  active: boolean;
  showRate?: boolean;
}

export const Sparkline = memo(function Sparkline({ active, showRate = true }: SparklineProps) {
  const [, force] = useState(0);

  useEffect(() => {
    if (!active) return;
    let last = 0;
    return subscribe(() => {
      const now = Date.now();
      if (now - last < 1000) return; // throttle re-render to 1Hz
      last = now;
      force(n => n + 1);
    });
  }, [active]);

  if (!active) return null;

  const samples = getSamples();
  const peak = Math.max(...samples, 0);
  if (peak <= 0) return null;

  const spark = renderSparkline(samples);
  const rate = getCurrentRate();
  const rateText = rate >= 100 ? `${(rate / 1000).toFixed(1)}k` : rate.toFixed(0);

  return (
    <>
      <Text color="cyan">{spark}</Text>
      {showRate && rate > 0 && (
        <Text color="gray" dimColor>{' '}{rateText} t/s</Text>
      )}
    </>
  );
});

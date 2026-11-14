import { useState } from 'react';
import { formatNumber } from '@/lib/formatNumber';
import { cn } from '@/lib/utils';

interface AnimatedCountProps {
  value: number;
  /** Formats the value for display. Defaults to {@link formatNumber}. */
  format?: (value: number) => string;
  /** Show nothing for 0 (the action bar's counts); a first count then rolls in. Default true. */
  hideZero?: boolean;
  className?: string;
}

/**
 * A count that rolls to its new value: the old number slides out and the new
 * one slides in, upward when it grows and downward when it shrinks. Only
 * changes animate; the first render shows the value as is.
 */
export function AnimatedCount({ value, format = formatNumber, hideZero = true, className }: AnimatedCountProps) {
  const label = (n: number) => (hideZero && n === 0 ? '' : format(n));

  const [shown, setShown] = useState(value);
  const [roll, setRoll] = useState<{ from: string; up: boolean; key: number } | null>(null);
  if (value !== shown) {
    setShown(value);
    if (label(value) !== label(shown)) {
      setRoll({ from: label(shown), up: value > shown, key: (roll?.key ?? 0) + 1 });
    }
  }

  const text = label(value);
  if (!text && !roll?.from) return null;

  return (
    <span className={cn('relative inline-grid overflow-hidden tabular-nums', className)}>
      {roll && (
        <span
          key={`out-${roll.key}`}
          aria-hidden
          className={cn(
            // Invisible rather than hidden under reduced motion, so the
            // animation still runs and its end clears the roll.
            '[grid-area:1/1] motion-reduce:invisible',
            roll.up ? 'animate-count-out-up' : 'animate-count-out-down',
          )}
          onAnimationEnd={() => setRoll(null)}
        >
          {roll.from}
        </span>
      )}
      <span
        key={`in-${roll?.key ?? 0}`}
        className={cn(
          '[grid-area:1/1]',
          roll && (roll.up ? 'motion-safe:animate-count-in-up' : 'motion-safe:animate-count-in-down'),
        )}
      >
        {text}
      </span>
    </span>
  );
}

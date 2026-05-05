/**
 * FloatingSocialHearts - Animated heart overlay for social interactions.
 *
 * Renders small floating heart symbols around the Blobbi when recent
 * social interactions (kind 1124) exist. Uses the same overlay pattern
 * as FloatingMusicNotes — CSS keyframe animation, absolute positioning,
 * and `prefers-reduced-motion` support.
 *
 * This is a pure visual cue. It does not change projection logic, does
 * not depend on stat thresholds, and is triggered solely by the presence
 * of projected social interactions.
 */

import { useMemo } from 'react';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FloatingSocialHeartsProps {
  /** Whether to show the floating hearts */
  active: boolean;
  /** Additional CSS classes */
  className?: string;
}

// ─── Configuration ────────────────────────────────────────────────────────────

/**
 * Heart configurations for positioning and timing.
 * Fewer items and slower cadence than music notes for a subtle effect.
 */
const HEART_CONFIGS = [
  { symbol: '💗', left: '15%', delay: '0s', duration: '3.5s' },
  { symbol: '✨', left: '80%', delay: '1.2s', duration: '3s' },
  { symbol: '💗', left: '55%', delay: '2.4s', duration: '3.8s' },
] as const;

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Renders floating heart/sparkle emojis around the Blobbi.
 *
 * Position this component as an overlay on the Blobbi container.
 * Hearts drift upward and fade, signaling that social care was received.
 */
export function FloatingSocialHearts({ active, className }: FloatingSocialHeartsProps) {
  const hearts = useMemo(() => (
    HEART_CONFIGS.map((config, index) => (
      <span
        key={index}
        className={cn(
          'absolute pointer-events-none select-none',
          'animate-social-heart-float text-sm',
        )}
        style={{
          left: config.left,
          bottom: '25%',
          animationDelay: config.delay,
          animationDuration: config.duration,
        }}
      >
        {config.symbol}
      </span>
    ))
  ), []);

  if (!active) {
    return null;
  }

  return (
    <div
      className={cn(
        'absolute inset-0 overflow-hidden pointer-events-none',
        className,
      )}
      aria-hidden="true"
    >
      {hearts}
    </div>
  );
}

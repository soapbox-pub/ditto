/**
 * FloatingMusicNotes - Animated music emoji overlay
 * 
 * Renders floating ♪ ♫ ♬ symbols around the Blobbi when music is playing.
 * Uses CSS animations for smooth, performant floating effect.
 */

import { useMemo } from 'react';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FloatingMusicNotesProps {
  /** Whether to show the floating notes */
  active: boolean;
  /** Additional CSS classes */
  className?: string;
}

// ─── Configuration ────────────────────────────────────────────────────────────

/**
 * Note configurations for positioning and timing.
 * Each note has unique position, delay, and duration for organic feel.
 */
const NOTE_CONFIGS = [
  { symbol: '♪', left: '10%', delay: '0s', duration: '3s' },
  { symbol: '♫', left: '85%', delay: '0.5s', duration: '3.5s' },
  { symbol: '♬', left: '25%', delay: '1s', duration: '2.8s' },
  { symbol: '♪', left: '70%', delay: '1.5s', duration: '3.2s' },
  { symbol: '♫', left: '50%', delay: '2s', duration: '3s' },
] as const;

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Renders floating music note emojis around the Blobbi.
 * 
 * Position this component as an overlay on the Blobbi container.
 * Notes float upward and fade out, creating a gentle music visualization.
 */
export function FloatingMusicNotes({ active, className }: FloatingMusicNotesProps) {
  // Memoize note elements to avoid recreation on every render
  const notes = useMemo(() => (
    NOTE_CONFIGS.map((config, index) => (
      <span
        key={index}
        className={cn(
          'absolute text-primary/70 pointer-events-none select-none',
          'animate-float-up text-lg',
        )}
        style={{
          left: config.left,
          bottom: '20%',
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
        className
      )}
      aria-hidden="true"
    >
      {notes}
    </div>
  );
}

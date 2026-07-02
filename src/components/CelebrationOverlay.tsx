import { useLayoutEffect, useMemo, useRef, useState } from 'react';

import type { CelebrationVariant } from '@/lib/celebrations';

/** Festive palette that reads well on both light and dark themes. */
const COLORS = ['#a78bfa', '#f472b6', '#fbbf24', '#38bdf8', '#34d399', '#fb7185'];

/** Warm golds/violets for the welcome sparkle. */
const SPARKLE_COLORS = ['#fbbf24', '#a78bfa', '#f472b6', '#fde68a'];

const CONFETTI_COUNT = 16;
const BALLOON_COUNT = 3;
const SPARKLE_COUNT = 10;

/** Gentle drift speed (px/s) for falling/rising particles. Kept slow so the
 *  effect reads as confetti settling, not a glitchy flash — especially on
 *  short feed cards. */
const MIN_SPEED = 55;
const MAX_SPEED = 90;

/** Cards taller than this animate as if they were this tall, capping the
 *  longest piece duration via the clamp below. */
const MAX_DISTANCE = 360;
const MAX_PIECE_DURATION = 4.5;

/** Overlay lifetime: max delay + max piece duration + slack, across all
 *  variants. The animations use `both` fill, so pieces stay invisible once
 *  finished even if unmount lags slightly. */
export const CELEBRATION_DURATION_MS = 6200;

interface FallingPiece {
  left: number;
  delay: number;
  speed: number;
  size: number;
  color: string;
  sway: number;
  spin: number;
  round: boolean;
}

interface Riser {
  char: string;
  left: number;
  delay: number;
  speed: number;
  sway: number;
  fontSize: number;
}

interface Sparkle {
  char: string;
  left: number;
  top: number;
  delay: number;
  duration: number;
  fontSize: number;
  color?: string;
}

function generateConfetti(): FallingPiece[] {
  return Array.from({ length: CONFETTI_COUNT }, (_, i) => ({
    left: 4 + Math.random() * 92,
    delay: Math.random() * 1.2,
    speed: MIN_SPEED + Math.random() * (MAX_SPEED - MIN_SPEED),
    size: 7 + Math.random() * 5,
    color: COLORS[i % COLORS.length],
    sway: (Math.random() - 0.5) * 50,
    spin: 270 + Math.random() * 360,
    round: i % 3 === 0,
  }));
}

function generateBalloons(): Riser[] {
  return Array.from({ length: BALLOON_COUNT }, () => ({
    char: '🎈',
    left: 10 + Math.random() * 80,
    delay: Math.random() * 0.8,
    speed: MIN_SPEED + Math.random() * (MAX_SPEED - MIN_SPEED),
    sway: (Math.random() - 0.5) * 40,
    fontSize: 15 + Math.random() * 6,
  }));
}

/** Halloween: ghosts drift up slowly; bats fly up faster with a wide sway. */
function generateSpookyRisers(): Riser[] {
  const ghosts: Riser[] = Array.from({ length: 3 }, () => ({
    char: '👻',
    left: 10 + Math.random() * 80,
    delay: Math.random() * 0.9,
    speed: 45 + Math.random() * 20,
    sway: (Math.random() - 0.5) * 40,
    fontSize: 15 + Math.random() * 6,
  }));
  const bats: Riser[] = Array.from({ length: 3 }, () => ({
    char: '🦇',
    left: 5 + Math.random() * 90,
    delay: Math.random() * 1.1,
    speed: 75 + Math.random() * 25,
    sway: (Math.random() - 0.5) * 90,
    fontSize: 12 + Math.random() * 5,
  }));
  return [...ghosts, ...bats];
}

function generateSparkles(): Sparkle[] {
  return Array.from({ length: SPARKLE_COUNT }, (_, i) => ({
    char: '✦',
    left: 5 + Math.random() * 88,
    top: 8 + Math.random() * 74,
    delay: Math.random() * 1.6,
    duration: 0.9 + Math.random() * 0.6,
    fontSize: 10 + Math.random() * 10,
    color: SPARKLE_COLORS[i % SPARKLE_COLORS.length],
  }));
}

/** Halloween: pumpkins wink in and out across the card. */
function generatePumpkins(): Sparkle[] {
  return Array.from({ length: 3 }, () => ({
    char: '🎃',
    left: 8 + Math.random() * 80,
    top: 12 + Math.random() * 65,
    delay: Math.random() * 1.4,
    duration: 1.1 + Math.random() * 0.5,
    fontSize: 14 + Math.random() * 6,
  }));
}

/**
 * One-shot celebration particle overlay for note cards.
 *
 * Variants:
 * - `confetti` — colored pieces drift down through the card.
 * - `birthday` — confetti plus rising 🎈 balloons.
 * - `spooky` — ghosts and bats rise while pumpkins wink in and out
 *   (seasonal, all of October).
 * - `sparkle` — twinkling stars across the card (welcome posts).
 * - `sunrise` — a warm glow and sun rising from the bottom (gm posts).
 *
 * Falling/rising travel distance is measured from the card itself and
 * per-piece durations derive from a constant px/s speed, so particles drift
 * gently through the whole card whether it's a two-line note or a tall media
 * post — a fixed distance either blinks out of short cards or stalls midway
 * down tall ones.
 *
 * Purely decorative: `aria-hidden`, `pointer-events-none`, hidden under
 * `prefers-reduced-motion` (the triggers also skip entirely — the class is
 * defense-in-depth). The parent should be `relative` with `overflow-hidden`
 * and unmount this component after `CELEBRATION_DURATION_MS`.
 */
export function CelebrationOverlay({ variant }: { variant: CelebrationVariant }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [distance, setDistance] = useState<number>();

  // Measure the card once on mount; particles render only after the
  // distance is known so durations are correct from the first frame.
  useLayoutEffect(() => {
    const height = containerRef.current?.offsetHeight ?? 0;
    // +24 so pieces fully exit past the card edge before fading.
    setDistance(Math.min(height + 24, MAX_DISTANCE));
  }, []);

  // Stable per mount — the effect plays once, so no need to regenerate.
  const falling = useMemo(
    () => (variant === 'confetti' || variant === 'birthday' ? generateConfetti() : []),
    [variant],
  );
  const risers = useMemo(() => {
    if (variant === 'birthday') return generateBalloons();
    if (variant === 'spooky') return generateSpookyRisers();
    return [];
  }, [variant]);
  const sparkles = useMemo(() => {
    if (variant === 'sparkle') return generateSparkles();
    if (variant === 'spooky') return generatePumpkins();
    return [];
  }, [variant]);

  const duration = (speed: number) =>
    distance ? Math.min(distance / speed, MAX_PIECE_DURATION) : 0;

  return (
    <div
      ref={containerRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden motion-reduce:hidden"
      style={{ '--celebration-distance': `${distance ?? 0}px` } as React.CSSProperties}
    >
      {distance !== undefined && falling.map((p, i) => (
        <span
          key={`f-${i}`}
          className="absolute animate-celebration-fall"
          style={{
            top: -12,
            left: `${p.left}%`,
            width: p.size,
            height: p.round ? p.size : p.size * 0.45,
            backgroundColor: p.color,
            borderRadius: p.round ? '9999px' : '1px',
            opacity: 0,
            animationDelay: `${p.delay}s`,
            animationDuration: `${duration(p.speed)}s`,
            '--celebration-sway': `${p.sway}px`,
            '--celebration-spin': `${p.spin}deg`,
          } as React.CSSProperties}
        />
      ))}
      {distance !== undefined && risers.map((b, i) => (
        <span
          key={`b-${i}`}
          className="absolute animate-celebration-rise select-none"
          style={{
            bottom: -20,
            left: `${b.left}%`,
            fontSize: b.fontSize,
            lineHeight: 1,
            opacity: 0,
            animationDelay: `${b.delay}s`,
            animationDuration: `${duration(b.speed)}s`,
            '--celebration-sway': `${b.sway}px`,
          } as React.CSSProperties}
        >
          {b.char}
        </span>
      ))}
      {sparkles.map((s, i) => (
        <span
          key={`s-${i}`}
          className="absolute animate-celebration-twinkle select-none"
          style={{
            left: `${s.left}%`,
            top: `${s.top}%`,
            fontSize: s.fontSize,
            lineHeight: 1,
            color: s.color,
            opacity: 0,
            animationDelay: `${s.delay}s`,
            animationDuration: `${s.duration}s`,
          } as React.CSSProperties}
        >
          {s.char}
        </span>
      ))}
      {variant === 'sunrise' && (
        <>
          {/* Warm wash rising from the bottom of the card. */}
          <div
            className="absolute inset-0 animate-celebration-glow"
            style={{
              background:
                'linear-gradient(to top, rgb(251 191 36 / 0.28), rgb(251 146 60 / 0.10) 40%, transparent 65%)',
              opacity: 0,
            }}
          />
          {/* The sun itself. */}
          <div
            className="absolute left-1/2 animate-celebration-sun"
            style={{
              bottom: -36,
              width: 56,
              height: 56,
              borderRadius: '9999px',
              background: 'radial-gradient(circle, #fde68a 0%, #fbbf24 55%, #f59e0b 100%)',
              boxShadow: '0 0 32px 12px rgb(251 191 36 / 0.35)',
              opacity: 0,
            }}
          />
        </>
      )}
    </div>
  );
}

import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { moonPhase, type CelebrationVariant } from '@/lib/celebrations';

/** Festive palette that reads well on both light and dark themes. */
const COLORS = ['#a78bfa', '#f472b6', '#fbbf24', '#38bdf8', '#34d399', '#fb7185'];

/** Warm golds/violets for the welcome sparkle. */
const SPARKLE_COLORS = ['#fbbf24', '#a78bfa', '#f472b6', '#fde68a'];

const CONFETTI_COUNT = 16;
const BALLOON_COUNT = 3;
const SPARKLE_COUNT = 10;
const NIGHT_STAR_COUNT = 7;

/** Pale moonlit tones for the gn stars. */
const NIGHT_STAR_COLORS = ['#e0e7ff', '#c7d2fe', '#fef3c7', '#a5b4fc'];
const HEART_COUNT = 44;

/** A few heart glyphs so the sprinkle doesn't read as a single repeated
 *  sticker. */
const HEART_CHARS = ['❤️', '💖', '💕', '💗'];

/** Hearts fall faster than the gentle confetti drift — the extra pace is
 *  what gives the reaction its umph. */
const HEART_MIN_SPEED = 130;
const HEART_MAX_SPEED = 220;

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

/** A heart glyph that falls from the top, swaying and gently rotating. */
interface HeartPiece {
  char: string;
  left: number;
  delay: number;
  speed: number;
  sway: number;
  spin: number;
  fontSize: number;
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

/** Hearts burst for the Love List — a dense pop of hearts that lands almost
 *  at once and rains down fast, then a light tail keeps a few coming. The
 *  squared delay front-loads most hearts into the first beat so it reads as
 *  a reaction, not a drizzle. */
function generateHearts(): HeartPiece[] {
  return Array.from({ length: HEART_COUNT }, (_, i) => ({
    char: HEART_CHARS[i % HEART_CHARS.length],
    left: 2 + Math.random() * 96,
    delay: Math.random() ** 2 * 1.1,
    speed: HEART_MIN_SPEED + Math.random() * (HEART_MAX_SPEED - HEART_MIN_SPEED),
    sway: (Math.random() - 0.5) * 90,
    spin: (Math.random() - 0.5) * 120,
    fontSize: 16 + Math.random() * 16,
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

/** gn moonrise: faint stars that wink in once night has settled, kept to the
 *  upper part of the card, away from the rising moon. */
function generateNightStars(): Sparkle[] {
  return Array.from({ length: NIGHT_STAR_COUNT }, (_, i) => ({
    char: '✦',
    left: 5 + Math.random() * 88,
    top: 6 + Math.random() * 45,
    delay: 0.6 + Math.random() * 1.8,
    duration: 1.2 + Math.random() * 0.8,
    fontSize: 7 + Math.random() * 6,
    color: NIGHT_STAR_COLORS[i % NIGHT_STAR_COLORS.length],
  }));
}

const MOON_SIZE = 56;
const MOON_RADIUS = 20;

/**
 * SVG path for the sunlit part of the moon at `phase` (0 = new, 0.5 = full),
 * centered on the origin. The lit side is bounded by a semicircular limb and
 * the terminator, a half-ellipse whose width follows the cosine of the phase
 * angle — bulging toward the limb for crescents and away from it for gibbous
 * moons. Drawn as seen from the northern hemisphere: waxing lights the right
 * side, waning the left.
 */
function moonLitPath(phase: number): string {
  const r = MOON_RADIUS;
  const waxing = phase < 0.5;
  const cos = Math.cos(phase * 2 * Math.PI);
  const rx = Math.abs(cos) * r;
  // Crescents have cos > 0 (the terminator curves the same way as the limb).
  const crescent = cos > 0;
  // Limb from top to bottom: clockwise passes through the right side.
  const limbSweep = waxing ? 1 : 0;
  // Terminator back from bottom to top: for a crescent it bulges toward the
  // limb's side, which is the opposite rotation from the limb.
  const termSweep = crescent ? 1 - limbSweep : limbSweep;
  return `M 0 ${-r} A ${r} ${r} 0 0 ${limbSweep} 0 ${r} A ${rx} ${r} 0 0 ${termSweep} 0 ${-r} Z`;
}

/** The major maria (dark basaltic plains), roughly where they sit on the
 *  near side with north up. */
const MARIA: { cx: number; cy: number; rx: number; ry: number; rotate?: number }[] = [
  { cx: -9.5, cy: 1, rx: 6.5, ry: 10, rotate: 12 }, // Oceanus Procellarum
  { cx: -4, cy: -8, rx: 5.5, ry: 4.8 }, // Imbrium
  { cx: 4.2, cy: -7, rx: 3.4, ry: 3.2 }, // Serenitatis
  { cx: 7.5, cy: -1, rx: 4.4, ry: 3.4, rotate: -15 }, // Tranquillitatis
  { cx: 14.2, cy: -4.5, rx: 2.4, ry: 2 }, // Crisium
  { cx: 12, cy: 4.5, rx: 2.4, ry: 3.4, rotate: 10 }, // Fecunditatis
  { cx: 6, cy: 6.5, rx: 2.4, ry: 2 }, // Nectaris
  { cx: -3, cy: 8, rx: 4, ry: 3 }, // Nubium
  { cx: -11, cy: 9.5, rx: 2.2, ry: 2.2 }, // Humorum
];

const TYCHO = { cx: -2.5, cy: 14.5 };
const TYCHO_RAYS = [-150, -110, -75, -40, -5, 30, 70, 115, 160, 200, 240, 280, 315];

/** Bright young craters: Tycho, Copernicus, Aristarchus. */
const CRATERS: { cx: number; cy: number; r: number }[] = [
  { ...TYCHO, r: 1.2 },
  { cx: -6.5, cy: -1.5, r: 1 },
  { cx: -13, cy: -6.5, r: 0.6 },
];

/**
 * The moon at `phase`: a limb-darkened disc with its maria and bright
 * craters over a fractal-noise grain, lit through a softly blurred
 * terminator, with the unlit side faintly visible in earthshine.
 */
function Moon({ phase, className, style }: { phase: number; className?: string; style?: React.CSSProperties }) {
  // SVG ids must be unique per instance and valid in `url(#…)`.
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const r = MOON_RADIUS;
  return (
    <svg className={className} style={style} viewBox="-25 -25 50 50" width={MOON_SIZE} height={MOON_SIZE}>
      <defs>
        {/* Limb darkening: brightest a little up-and-in, dimming to the edge. */}
        <radialGradient id={`${id}-surface`} cx="45%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#fbf8ee" />
          <stop offset="70%" stopColor="#ece5d0" />
          <stop offset="100%" stopColor="#cfc6ae" />
        </radialGradient>
        {/* Mottling: low-frequency noise mapped to translucent grey-brown,
            darkest where the noise is strongest, clipped to the disc. */}
        <filter id={`${id}-texture`} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.055" numOctaves="4" seed="11" />
          <feColorMatrix
            type="matrix"
            values="0 0 0 0 0.42  0 0 0 0 0.39  0 0 0 0 0.34  3.2 0 0 0 -1.4"
          />
          <feComposite operator="in" in2="SourceGraphic" />
        </filter>
        <clipPath id={`${id}-disc`}>
          <circle r={r} />
        </clipPath>
        <filter id={`${id}-soft`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="0.8" />
        </filter>
        <mask id={`${id}-lit`} maskUnits="userSpaceOnUse" x="-25" y="-25" width="50" height="50">
          <g filter={`url(#${id}-soft)`}>
            <path d={moonLitPath(phase)} fill="white" />
          </g>
        </mask>
      </defs>
      {/* Earthshine: the unlit side, faintly visible. */}
      <circle r={r} fill="#64748b" opacity={0.3} />
      {/* Sunlit side; the clip keeps the limb crisp while the mask's blur
          softens only the terminator. */}
      <g clipPath={`url(#${id}-disc)`}>
        <g mask={`url(#${id}-lit)`}>
          <circle r={r} fill={`url(#${id}-surface)`} />
          <circle r={r} fill="white" filter={`url(#${id}-texture)`} />
          <g filter={`url(#${id}-soft)`} fill="#8a826f" opacity={0.4}>
            {MARIA.map((m, i) => (
              <ellipse
                key={i}
                cx={m.cx}
                cy={m.cy}
                rx={m.rx}
                ry={m.ry}
                transform={m.rotate ? `rotate(${m.rotate} ${m.cx} ${m.cy})` : undefined}
              />
            ))}
          </g>
          <g stroke="#fffdf5" strokeLinecap="round" strokeWidth={0.3} opacity={0.2}>
            {TYCHO_RAYS.map((a, i) => {
              const rad = (a * Math.PI) / 180;
              const len = 4 + (i % 3) * 2.5;
              return (
                <line
                  key={a}
                  x1={TYCHO.cx}
                  y1={TYCHO.cy}
                  x2={TYCHO.cx + Math.cos(rad) * len}
                  y2={TYCHO.cy + Math.sin(rad) * len}
                />
              );
            })}
          </g>
          {CRATERS.map((c, i) => (
            <g key={i}>
              <circle cx={c.cx} cy={c.cy} r={c.r * 2} fill="rgb(255 255 255 / 0.15)" />
              <circle cx={c.cx} cy={c.cy} r={c.r} fill="rgb(255 253 245 / 0.7)" />
            </g>
          ))}
        </g>
      </g>
    </svg>
  );
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
 * - `moonrise` — night settles from the top, the moon rises in its phase at
 *   `createdAt` and stars twinkle in (gn posts).
 * - `hearts` — hearts rain down from the top (adding a profile to your Love List).
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
export function CelebrationOverlay({
  variant,
  createdAt,
}: {
  variant: CelebrationVariant;
  /** Unix timestamp (seconds) of the note, used by `moonrise` to draw the
   *  moon phase at the time of posting. Defaults to now. */
  createdAt?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [distance, setDistance] = useState<number>();
  const phase = useMemo(
    () => moonPhase(createdAt ?? Date.now() / 1000),
    [createdAt],
  );

  // Hearts fill a full page-region overlay rather than a feed card, so they
  // travel further than the card variants. Speed scales with the measured
  // region so hearts always reach the bottom within the shared overlay
  // lifetime, and the per-piece duration cap keeps them inside the budget.
  const isRegion = variant === 'hearts';
  const maxDistance = isRegion ? 900 : MAX_DISTANCE;
  const maxPieceDuration = isRegion ? 4 : MAX_PIECE_DURATION;

  // Measure the card once on mount; particles render only after the
  // distance is known so durations are correct from the first frame.
  useLayoutEffect(() => {
    const height = containerRef.current?.offsetHeight ?? 0;
    // +24 so pieces fully exit past the card edge before fading.
    setDistance(Math.min(height + 24, maxDistance));
  }, [maxDistance]);

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
  const hearts = useMemo(
    () => (variant === 'hearts' ? generateHearts() : []),
    [variant],
  );
  const sparkles = useMemo(() => {
    if (variant === 'sparkle') return generateSparkles();
    if (variant === 'spooky') return generatePumpkins();
    if (variant === 'moonrise') return generateNightStars();
    return [];
  }, [variant]);

  const duration = (speed: number) =>
    distance ? Math.min(distance / speed, maxPieceDuration) : 0;

  return (
    <div
      ref={containerRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden motion-reduce:hidden z-10"
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
      {distance !== undefined && hearts.map((h, i) => (
        <span
          key={`h-${i}`}
          className="absolute animate-heart-fall select-none"
          style={{
            top: -20,
            left: `${h.left}%`,
            fontSize: h.fontSize,
            lineHeight: 1,
            opacity: 0,
            animationDelay: `${h.delay}s`,
            animationDuration: `${duration(h.speed)}s`,
            '--celebration-sway': `${h.sway}px`,
            '--celebration-spin': `${h.spin}deg`,
          } as React.CSSProperties}
        >
          {h.char}
        </span>
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
      {variant === 'moonrise' && (
        <>
          {/* Cool dusk settling from the top of the card. */}
          <div
            className="absolute inset-0 animate-celebration-glow"
            style={{
              background:
                'linear-gradient(to bottom, rgb(67 56 202 / 0.22), rgb(99 102 241 / 0.08) 45%, transparent 70%)',
              opacity: 0,
            }}
          />
          {/* The moon, in its phase at the time of posting. */}
          <Moon
            phase={phase}
            className="absolute left-1/2 animate-celebration-moon"
            style={{
              bottom: -40,
              filter: 'drop-shadow(0 0 10px rgb(226 232 240 / 0.5))',
              opacity: 0,
            }}
          />
        </>
      )}
    </div>
  );
}

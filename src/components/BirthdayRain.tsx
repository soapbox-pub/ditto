import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';

/**
 * Continuous birthday rain for profile pages (NIP-24 birthday).
 *
 * Unlike {@link CelebrationOverlay} — a one-shot burst sized for feed cards —
 * this is a persistent weather effect: confetti pieces fall steadily from the
 * top of the region while 🎈 balloons rise buoyantly from the bottom, for as
 * long as it's mounted. Every piece loops with
 * `animation-iteration-count: infinite` and a random negative delay, so the
 * sky is already full of confetti on the first frame and there are no waves,
 * gaps, or remount stutters.
 *
 * Fill the region to rain over (e.g. an absolutely-positioned,
 * `overflow-hidden` band over the whole content column) — travel distance is
 * measured from the container so pieces always cross the full region at a
 * constant px/s pace, and confetti density scales with the measured height so
 * a tall profile feed rains top to bottom instead of thinning out (balloons
 * stay a fixed handful). The confetti pool is generated once and only a
 * height-scaled prefix renders, so the region growing (feed pages loading in)
 * adds pieces without restarting the ones already falling.
 *
 * Purely decorative: `aria-hidden`, `pointer-events-none`, hidden under
 * `prefers-reduced-motion`.
 */

/** Festive palette that reads well on both light and dark themes. */
const COLORS = ['#a78bfa', '#f472b6', '#fbbf24', '#38bdf8', '#34d399', '#fb7185'];

/** Confetti density per 1000px of region height, with a floor so even a
 *  short region reads as a proper celebration and a cap to bound
 *  DOM/compositor cost on very long feeds. Balloons don't scale — always
 *  exactly a few big ones, regardless of region height. */
const CONFETTI_PER_1000PX = 45;
const MIN_CONFETTI = 24;
const MAX_CONFETTI = 140;
const BALLOON_COUNT = 4;

/** Gentle drift speeds (px/s). Balloons are buoyant, so they float up a
 *  touch slower than the confetti falls around them. */
const CONFETTI_MIN_SPEED = 50;
const CONFETTI_MAX_SPEED = 95;
const BALLOON_MIN_SPEED = 38;
const BALLOON_MAX_SPEED = 55;

interface RainPiece {
  kind: 'confetti' | 'balloon';
  left: number;
  /** Fall speed in px/s — duration derives from the measured distance. */
  speed: number;
  /** 0..1 — how far through its cycle the piece starts (negative delay). */
  phase: number;
  size: number;
  color: string;
  sway: number;
  spin: number;
  round: boolean;
}

function generateRain(): { confetti: RainPiece[]; balloons: RainPiece[] } {
  const confetti: RainPiece[] = Array.from({ length: MAX_CONFETTI }, (_, i) => ({
    kind: 'confetti',
    left: 2 + Math.random() * 96,
    speed: CONFETTI_MIN_SPEED + Math.random() * (CONFETTI_MAX_SPEED - CONFETTI_MIN_SPEED),
    phase: Math.random(),
    size: 7 + Math.random() * 5,
    color: COLORS[i % COLORS.length],
    sway: (Math.random() - 0.5) * 60,
    spin: 270 + Math.random() * 360,
    round: i % 3 === 0,
  }));

  const balloons: RainPiece[] = Array.from({ length: BALLOON_COUNT }, () => ({
    kind: 'balloon',
    left: 5 + Math.random() * 90,
    speed: BALLOON_MIN_SPEED + Math.random() * (BALLOON_MAX_SPEED - BALLOON_MIN_SPEED),
    phase: Math.random(),
    size: 44 + Math.random() * 20,
    color: '',
    sway: (Math.random() - 0.5) * 50,
    // Balloons tip gently instead of tumbling.
    spin: (Math.random() - 0.5) * 40,
    round: false,
  }));

  return { confetti, balloons };
}

export function BirthdayRain() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [distance, setDistance] = useState<number>();

  // Measure the region so every piece travels its full height at a constant
  // px/s pace, then re-measure if the region resizes (e.g. rotation).
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const measure = () => setDistance(el.offsetHeight + 32);
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // The full pool is generated once — density changes only slice it, so
  // pieces already in flight never regenerate or restart.
  const { confetti, balloons } = useMemo(generateRain, []);

  // Scale visible confetti to the region height so tall feeds rain top to
  // bottom at the same density as a short profile. Balloons are a fixed
  // handful.
  const confettiCount = distance === undefined ? 0 : Math.min(
    Math.max(Math.round((distance / 1000) * CONFETTI_PER_1000PX), MIN_CONFETTI),
    MAX_CONFETTI,
  );
  const balloonCount = distance === undefined ? 0 : BALLOON_COUNT;

  return (
    <div
      ref={containerRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden motion-reduce:hidden"
      style={{ '--rain-distance': `${distance ?? 0}px` } as React.CSSProperties}
    >
      {distance !== undefined && confetti.slice(0, confettiCount).map((p, i) => {
        const duration = distance / p.speed;
        return (
          <span
            key={`c-${i}`}
            className="absolute animate-birthday-rain"
            style={{
              top: -28,
              left: `${p.left}%`,
              width: p.size,
              height: p.round ? p.size : p.size * 0.45,
              backgroundColor: p.color,
              borderRadius: p.round ? '9999px' : '1px',
              opacity: 0,
              // Negative delay starts the piece mid-fall — full rain at mount.
              animationDelay: `${-p.phase * duration}s`,
              '--rain-duration': `${duration}s`,
              '--rain-sway': `${p.sway}px`,
              '--rain-spin': `${p.spin}deg`,
            } as React.CSSProperties}
          />
        );
      })}
      {distance !== undefined && balloons.slice(0, balloonCount).map((p, i) => {
        const duration = distance / p.speed;
        return (
          <span
            key={`b-${i}`}
            className="absolute animate-birthday-float select-none"
            style={{
              // Starts fully below the clipped bottom edge and floats up.
              bottom: -72,
              left: `${p.left}%`,
              fontSize: p.size,
              lineHeight: 1,
              opacity: 0,
              animationDelay: `${-p.phase * duration}s`,
              '--rain-duration': `${duration}s`,
              '--rain-sway': `${p.sway}px`,
              '--rain-spin': `${p.spin}deg`,
            } as React.CSSProperties}
          >
            🎈
          </span>
        );
      })}
    </div>
  );
}

/**
 * A striped party hat with a pom-pom, for perching on avatars during
 * birthday celebrations. Colors come from the same festive palette as the
 * confetti rain. Decorative only (`aria-hidden`) — position and tilt it
 * from the caller (e.g. absolutely over an avatar's top edge, rotated).
 *
 * `pomScale` grows the pom-pom relative to the cone — useful at small
 * rendered sizes (note card avatars) where the default pom reads as a dot.
 */
export function PartyHat({ className, pomScale = 1 }: { className?: string; pomScale?: number }) {
  // The cone stripes are painted inside a clipPath; useId keeps the clip
  // reference unique if more than one hat is ever on screen.
  const clipId = useId();

  const pomRadius = 5.5 * pomScale;
  // Keep the pom inside the viewBox: slide it down the tip as it grows.
  const pomY = Math.max(7, pomRadius + 1.5);

  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <defs>
        <clipPath id={clipId}>
          {/* The cone. */}
          <path d="M32 7 L53 55 L11 55 Z" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        {/* Base coat + gently curved stripes so the cone reads as rounded. */}
        <rect x="0" y="0" width="64" height="64" fill="#a78bfa" />
        <path d="M2 45 Q32 36 62 45 L62 58 Q32 49 2 58 Z" fill="#f472b6" />
        <path d="M8 28 Q32 21 56 28 L56 37 Q32 30 8 37 Z" fill="#fbbf24" />
        <path d="M20 12 Q32 9 44 12 L44 19 Q32 16 20 19 Z" fill="#38bdf8" />
      </g>
      {/* Brim — a soft curve that sits on the head. */}
      <path d="M11 55 Q32 48 53 55 Q32 62 11 55 Z" fill="#8b5cf6" />
      {/* Pom-pom. */}
      <circle cx="32" cy={pomY} r={pomRadius} fill="#fbbf24" />
      <circle cx={32 - 1.8 * pomScale} cy={pomY - 1.6 * pomScale} r={1.8 * pomScale} fill="#fde68a" />
    </svg>
  );
}

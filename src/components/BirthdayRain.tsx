import { useLayoutEffect, useMemo, useRef, useState } from 'react';

/**
 * Continuous birthday rain for profile pages (NIP-24 birthday).
 *
 * Unlike {@link CelebrationOverlay} — a one-shot burst sized for feed cards —
 * this is a persistent weather effect: confetti pieces *and* 🎈 balloons all
 * fall steadily from the top of the region for as long as it's mounted.
 * Every piece loops with `animation-iteration-count: infinite` and a random
 * negative delay, so the sky is already full of confetti on the first frame
 * and there are no waves, gaps, or remount stutters.
 *
 * Fill the region to rain over (e.g. an absolutely-positioned,
 * `overflow-hidden` band over the whole content column) — travel distance is
 * measured from the container so pieces always cross the full region at a
 * constant px/s pace, and piece density scales with the measured height so a
 * tall profile feed rains top to bottom instead of thinning out. The piece
 * pool is generated once and only a height-scaled prefix renders, so the
 * region growing (feed pages loading in) adds pieces without restarting the
 * ones already falling.
 *
 * Purely decorative: `aria-hidden`, `pointer-events-none`, hidden under
 * `prefers-reduced-motion`.
 */

/** Festive palette that reads well on both light and dark themes. */
const COLORS = ['#a78bfa', '#f472b6', '#fbbf24', '#38bdf8', '#34d399', '#fb7185'];

/** Piece density per 1000px of region height, with floors so even a short
 *  region reads as a proper celebration and caps to bound DOM/compositor
 *  cost on very long feeds. */
const CONFETTI_PER_1000PX = 45;
const BALLOONS_PER_1000PX = 12;
const MIN_CONFETTI = 24;
const MIN_BALLOONS = 7;
const MAX_CONFETTI = 140;
const MAX_BALLOONS = 36;

/** Gentle drift speeds (px/s). Balloons are heavier-looking, so they drift
 *  down a touch slower than the confetti around them. */
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

  const balloons: RainPiece[] = Array.from({ length: MAX_BALLOONS }, () => ({
    kind: 'balloon',
    left: 5 + Math.random() * 90,
    speed: BALLOON_MIN_SPEED + Math.random() * (BALLOON_MAX_SPEED - BALLOON_MIN_SPEED),
    phase: Math.random(),
    size: 15 + Math.random() * 7,
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

  // Scale visible pieces to the region height so tall feeds rain top to
  // bottom at the same density as a short profile.
  const confettiCount = distance === undefined ? 0 : Math.min(
    Math.max(Math.round((distance / 1000) * CONFETTI_PER_1000PX), MIN_CONFETTI),
    MAX_CONFETTI,
  );
  const balloonCount = distance === undefined ? 0 : Math.min(
    Math.max(Math.round((distance / 1000) * BALLOONS_PER_1000PX), MIN_BALLOONS),
    MAX_BALLOONS,
  );

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
            className="absolute animate-birthday-rain select-none"
            style={{
              top: -28,
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

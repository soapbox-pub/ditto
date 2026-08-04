import { Sparkles } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * A small, bounded, one-shot sparkle burst rendered next to a mission progress
 * count to punctuate a task completion. Purely decorative and layout-neutral: it
 * is absolutely positioned, `pointer-events-none`, and each spark animates with
 * transform/opacity only (see `.mission-sparkle` in index.css), so it never
 * shifts layout or intercepts clicks.
 *
 * It renders nothing unless `active` (the celebration window). Each spark flies
 * out in its own direction with a slight stagger via the `--sx/--sy/--sd` CSS
 * custom properties, then fades — a small local reward flourish, never a
 * full-screen confetti. Honors `prefers-reduced-motion` via the CSS (the
 * animation is disabled, so the sparks simply don't appear).
 *
 * Place inside a `relative`-positioned element (e.g. the count pill's wrapper).
 */
export function MissionCelebrationSparkle({
  active,
  className,
}: {
  active: boolean;
  className?: string;
}) {
  if (!active) return null;

  return (
    <span
      aria-hidden
      className={cn(
        'pointer-events-none absolute inset-0 z-10 flex items-center justify-center',
        className,
      )}
    >
      {SPARKS.map((spark, i) => (
        <Sparkles
          key={i}
          className={cn('mission-sparkle absolute text-primary', spark.size)}
          style={
            {
              '--sx': spark.x,
              '--sy': spark.y,
              '--sd': spark.delay,
            } as React.CSSProperties
          }
        />
      ))}
    </span>
  );
}

/** Fixed spark directions/sizes/delays for a compact, balanced little burst. */
const SPARKS: ReadonlyArray<{ x: string; y: string; size: string; delay: string }> = [
  { x: '-14px', y: '-12px', size: 'size-3', delay: '0ms' },
  { x: '13px', y: '-13px', size: 'size-2.5', delay: '70ms' },
  { x: '0px', y: '-18px', size: 'size-2', delay: '130ms' },
  { x: '15px', y: '6px', size: 'size-2', delay: '40ms' },
  { x: '-15px', y: '7px', size: 'size-2.5', delay: '100ms' },
];

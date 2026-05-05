/**
 * ReactionOverlays — Temporary particle overlays for care-action reactions.
 *
 * Each component follows the same pattern as FloatingMusicNotes and
 * FloatingSocialHearts: absolute-positioned overlay, CSS keyframe animation,
 * prefers-reduced-motion support. They are designed to be layered inside the
 * BlobbiStageVisual or BlobbiRoomHero container.
 *
 * Components:
 *   - ReactionSparkles: CSS sparkle shapes after cleaning
 *   - ReactionBubbles: bubble wash covering Blobbi (clean_complete phase 1)
 */

import { cn } from '@/lib/utils';

// ─── Sparkles ────────────────────────────────────────────────────────────────

export interface ReactionSparklesProps {
  active: boolean;
  className?: string;
}

/**
 * Sparkle particle positions — balanced around the Blobbi body center.
 * Horizontal spread is tightened (20%-80%) to cluster around the body
 * rather than appearing at the container edges on larger adult sizes.
 */
const SPARKLE_CONFIGS = [
  { left: '22%', top: '18%', delay: '0s',    scale: 0.8 },
  { left: '72%', top: '22%', delay: '0.2s',  scale: 1.0 },
  { left: '30%', top: '65%', delay: '0.4s',  scale: 0.6 },
  { left: '68%', top: '60%', delay: '0.15s', scale: 0.85 },
  { left: '48%', top: '12%', delay: '0.35s', scale: 1.0 },
  { left: '20%', top: '42%', delay: '0.5s',  scale: 0.7 },
  { left: '78%', top: '45%', delay: '0.1s',  scale: 0.75 },
  { left: '55%', top: '72%', delay: '0.25s', scale: 0.65 },
  { left: '38%', top: '35%', delay: '0.45s', scale: 0.9 },
] as const;

/**
 * Sparkle particles that appear around the Blobbi after cleaning.
 * Uses CSS 4-point star shapes instead of emoji for a polished effect.
 */
export function ReactionSparkles({ active, className }: ReactionSparklesProps) {
  if (!active) return null;

  return (
    <div
      className={cn('absolute inset-0 overflow-hidden pointer-events-none', className)}
      aria-hidden="true"
    >
      {SPARKLE_CONFIGS.map((config, i) => (
        <span
          key={i}
          className="absolute pointer-events-none select-none animate-reaction-sparkle"
          style={{
            left: config.left,
            top: config.top,
            animationDelay: config.delay,
          }}
        >
          {/* 4-point CSS star sparkle */}
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            style={{ transform: `scale(${config.scale})` }}
          >
            <path
              d="M8 0 L9.5 6.5 L16 8 L9.5 9.5 L8 16 L6.5 9.5 L0 8 L6.5 6.5 Z"
              fill="currentColor"
              className="text-yellow-300"
            />
            <path
              d="M8 3 L8.8 6.8 L12 8 L8.8 9.2 L8 13 L7.2 9.2 L4 8 L7.2 6.8 Z"
              fill="white"
              opacity="0.7"
            />
          </svg>
        </span>
      ))}
    </div>
  );
}

// ─── Bubbles ─────────────────────────────────────────────────────────────────

export interface ReactionBubblesProps {
  active: boolean;
  /** Whether to show the semi-opaque backdrop behind bubbles. Default: true. */
  showBackdrop?: boolean;
  className?: string;
}

/**
 * Bubble configs — dense coverage across the full overlay to obscure Blobbi.
 * Uses many bubbles at varying depths to create a "covered in suds" effect.
 */
const BUBBLE_CONFIGS = [
  // Bottom layer
  { left: '15%', bottom: '5%',  delay: '0s',    size: 22 },
  { left: '40%', bottom: '3%',  delay: '0.05s', size: 26 },
  { left: '65%', bottom: '8%',  delay: '0.08s', size: 20 },
  { left: '85%', bottom: '6%',  delay: '0.03s', size: 24 },
  // Lower-mid layer
  { left: '25%', bottom: '18%', delay: '0.1s',  size: 28 },
  { left: '55%', bottom: '15%', delay: '0.12s', size: 24 },
  { left: '75%', bottom: '20%', delay: '0.06s', size: 22 },
  { left: '10%', bottom: '22%', delay: '0.14s', size: 20 },
  // Mid layer
  { left: '35%', bottom: '30%', delay: '0.08s', size: 30 },
  { left: '60%', bottom: '32%', delay: '0.15s', size: 26 },
  { left: '20%', bottom: '35%', delay: '0.1s',  size: 24 },
  { left: '80%', bottom: '33%', delay: '0.12s', size: 22 },
  // Upper-mid layer
  { left: '45%', bottom: '42%', delay: '0.06s', size: 28 },
  { left: '15%', bottom: '48%', delay: '0.16s', size: 22 },
  { left: '70%', bottom: '45%', delay: '0.09s', size: 26 },
  // Top layer
  { left: '30%', bottom: '55%', delay: '0.12s', size: 24 },
  { left: '55%', bottom: '58%', delay: '0.04s', size: 20 },
  { left: '78%', bottom: '52%', delay: '0.14s', size: 22 },
] as const;

/**
 * Bubble wash overlay that covers the Blobbi during clean_complete phase 1.
 * Uses CSS circles with gradients instead of emoji for a sudsy, covering effect.
 */
export function ReactionBubbles({ active, showBackdrop = true, className }: ReactionBubblesProps) {
  if (!active) return null;

  return (
    <div
      className={cn('absolute inset-0 overflow-hidden pointer-events-none z-10', className)}
      aria-hidden="true"
    >
      {/* Semi-opaque backdrop to partially obscure Blobbi */}
      {showBackdrop && (
        <div className="absolute inset-0 bg-sky-100/40 dark:bg-sky-900/30 animate-reaction-bubble-backdrop rounded-full" />
      )}
      {BUBBLE_CONFIGS.map((config, i) => (
        <span
          key={i}
          className="absolute pointer-events-none select-none animate-reaction-bubble"
          style={{
            left: config.left,
            bottom: config.bottom,
            animationDelay: config.delay,
            width: config.size,
            height: config.size,
          }}
        >
          {/* CSS bubble with highlight */}
          <span
            className="block w-full h-full rounded-full"
            style={{
              background: 'radial-gradient(circle at 35% 30%, rgba(255,255,255,0.8) 0%, rgba(186,230,253,0.6) 40%, rgba(125,211,252,0.3) 70%, transparent 100%)',
              border: '1px solid rgba(125,211,252,0.5)',
            }}
          />
        </span>
      ))}
    </div>
  );
}

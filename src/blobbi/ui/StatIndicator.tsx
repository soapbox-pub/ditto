import type { CSSProperties } from 'react';
import { AlertTriangle, Utensils, Gamepad2, Heart, Droplets, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CareState } from '@/blobbi/core/lib/blobbi-segments';

// ── Constants ─────────────────────────────────────────────────────────────────

const STAT_COLORS: Record<string, string> = {
  orange: 'text-orange-500',
  yellow: 'text-yellow-500',
  green: 'text-green-500',
  blue: 'text-blue-500',
  violet: 'text-violet-500',
};

const STAT_BG_COLORS: Record<string, string> = {
  orange: 'bg-orange-500/10',
  yellow: 'bg-yellow-500/10',
  green: 'bg-green-500/10',
  blue: 'bg-blue-500/10',
  violet: 'bg-violet-500/10',
};

const STAT_RING_HEX: Record<string, string> = {
  orange: '#f97316',
  yellow: '#eab308',
  green: '#22c55e',
  blue: '#3b82f6',
  violet: '#8b5cf6',
};

/** Muted colour for empty/unfilled segments. */
const MUTED_RING_HEX = 'currentColor';
const MUTED_RING_OPACITY = 0.12;

/** Lucide icon component for each stat. */
const STAT_ICON_MAP: Record<string, React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
  hunger: Utensils,
  happiness: Gamepad2,
  health: Heart,
  hygiene: Droplets,
  energy: Zap,
};

// ── Size presets ──────────────────────────────────────────────────────────────

const SIZE_PRESETS = {
  sm: {
    container: 'size-9',
    icon: 'size-3.5',
    strokeWidth: 2.5,
    alertSize: 'size-2.5',
    alertPos: '-top-1 -right-1.5',
    /** Degrees of empty gap between segments. */
    gapDeg: 20,
  },
  md: {
    container: 'size-[4.5rem] sm:size-20',
    icon: 'size-6 sm:size-7',
    strokeWidth: 2.5,
    alertSize: 'size-3.5',
    alertPos: '-top-1.5 -right-2',
    gapDeg: 16,
  },
} as const;

// ── Segmented ring ───────────────────────────────────────────────────────────

/** SVG viewBox dimensions and circle radius (shared between both ring modes). */
const VB = 36;
const R = 15;
const CX = VB / 2;
const CY = VB / 2;
const CIRCUMFERENCE = 2 * Math.PI * R;

export interface SegmentedRingProps {
  /** Number of filled (coloured) segments. */
  filled: number;
  /** Total number of segments. */
  max: number;
  /** Hex colour for filled segments. */
  fillHex: string;
  /** Stroke width. */
  strokeWidth: number;
  /** Gap between segments in degrees. */
  gapDeg: number;
}

/**
 * Render a ring divided into `max` equal arc segments.
 * The first `filled` segments use `fillHex`; the rest use the muted track.
 *
 * Uses butt linecaps so gaps are exactly the specified width — round caps
 * extend beyond the dash boundary and visually close small gaps.
 *
 * The ring is drawn at 0-deg = 12-o'clock (the parent applies -rotate-90 on
 * the SVG to achieve this, matching the old continuous ring convention).
 */
export function SegmentedRing({ filled, max, fillHex, strokeWidth, gapDeg }: SegmentedRingProps) {
  const totalGapDeg = gapDeg * max;
  const segDeg = (360 - totalGapDeg) / max;
  const segLen = (segDeg / 360) * CIRCUMFERENCE;

  // Each segment is a <circle> with dasharray = "segLen rest-of-circumference".
  // dashoffset rotates it to the correct angular position.
  //
  // Start offset: shift by half a gap so the first gap straddles the
  // 12-o'clock position (after the parent's -rotate-90). This keeps the
  // ring visually centred and symmetrical around all four quadrants.
  const segments: React.ReactNode[] = [];
  let offsetDeg = gapDeg / 2;

  for (let i = 0; i < max; i++) {
    const isFilled = i < filled;
    const dashOffset = -(offsetDeg / 360) * CIRCUMFERENCE;

    segments.push(
      <circle
        key={i}
        cx={CX}
        cy={CY}
        r={R}
        fill="none"
        strokeWidth={strokeWidth}
        strokeLinecap="butt"
        stroke={isFilled ? fillHex : MUTED_RING_HEX}
        opacity={isFilled ? 1 : MUTED_RING_OPACITY}
        strokeDasharray={`${segLen} ${CIRCUMFERENCE - segLen}`}
        strokeDashoffset={dashOffset}
        className="transition-all duration-500"
      />,
    );

    offsetDeg += segDeg + gapDeg;
  }

  return <>{segments}</>;
}

// ── Component ─────────────────────────────────────────────────────────────────

export interface StatIndicatorProps {
  stat: string;
  value: number | undefined;
  color: 'orange' | 'yellow' | 'green' | 'blue' | 'violet';
  /** Care state from the segment display model. Drives badge and pulse. */
  careState?: CareState;
  /** Segment counts for visual ring. When provided, renders segmented arcs. */
  segments?: { filled: number; max: number };
  /** Visual size preset. Default: 'md'. */
  size?: 'sm' | 'md';
  /** When provided, renders as a clickable button. */
  onClick?: () => void;
  /** Disable the button (only relevant when onClick is set). */
  disabled?: boolean;
}

export function StatIndicator({
  stat,
  value,
  color,
  careState,
  segments,
  size = 'md',
  onClick,
  disabled,
}: StatIndicatorProps) {
  const displayValue = value ?? 0;

  const showBadge = careState === 'attention' || careState === 'urgent';
  const showPulse = careState === 'urgent';
  const badgeColor = careState === 'urgent' ? 'text-red-500' : 'text-amber-500';

  const ringHex = STAT_RING_HEX[color];
  const IconComponent = STAT_ICON_MAP[stat];
  const preset = SIZE_PRESETS[size];

  const inner = (
    <>
      {/* Ring — segmented when segment data is available, continuous fallback otherwise */}
      <svg className="absolute inset-0 -rotate-90" viewBox={`0 0 ${VB} ${VB}`}>
        {segments ? (
          <SegmentedRing
            filled={segments.filled}
            max={segments.max}
            fillHex={ringHex}
            strokeWidth={preset.strokeWidth}
            gapDeg={preset.gapDeg}
          />
        ) : (
          <>
            <circle cx={CX} cy={CY} r={R} fill="none" stroke="currentColor" strokeWidth={preset.strokeWidth} className="text-muted/15" />
            <circle
              cx={CX} cy={CY} r={R} fill="none" strokeWidth={preset.strokeWidth} strokeLinecap="round"
              stroke={ringHex}
              strokeDasharray={`${displayValue * 0.94} 100`}
              className="transition-all duration-500"
            />
          </>
        )}
      </svg>
      {/* Icon with warning badge */}
      <div className="relative">
        {IconComponent && <IconComponent className={cn(preset.icon, STAT_COLORS[color])} strokeWidth={2.5} />}
        {showBadge && (
          <AlertTriangle
            className={cn('absolute', preset.alertPos, preset.alertSize, badgeColor)}
            strokeWidth={3}
          />
        )}
      </div>
    </>
  );

  /* Negative delay (-999999s) inside the shorthand locks every instance to
     the same phase of the cycle regardless of mount time.  The delay MUST
     live in the shorthand string — setting animationDelay as a separate
     longhand conflicts with the shorthand's implicit delay:0. */
  const glowStyle: CSSProperties | undefined =
    status === 'warning'
      ? { animation: 'stat-glow 2s ease-in-out -999999s infinite' }
      : status === 'critical'
        ? { animation: 'stat-glow-critical 2s ease-in-out -999999s infinite' }
        : undefined;

  const baseClass = cn(
    'relative rounded-full flex items-center justify-center',
    preset.container,
    STAT_BG_COLORS[color],
    showPulse && 'animate-pulse',
  );

  if (onClick) {
    return (
      <button
        onClick={onClick}
        disabled={disabled}
        className={cn(
          baseClass,
          'transition-transform hover:scale-110 active:scale-95',
          disabled && 'opacity-40 pointer-events-none',
        )}
        style={glowStyle}
        aria-label={`${stat} ${displayValue}%`}
      >
        {inner}
      </button>
    );
  }

  return <div className={baseClass} style={glowStyle}>{inner}</div>;
}

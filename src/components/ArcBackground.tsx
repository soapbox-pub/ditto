import { cn } from '@/lib/utils';

/** Arc overhang for the downward arc (top bar / sub-header). */
export const ARC_OVERHANG_PX = 20;

/** Larger overhang for the upward arc (bottom nav) so the harsher curve isn't clipped. */
export const ARC_UP_OVERHANG_PX = 28;

/** SVG path for a downward arc (used by top bar and sub-header bar). */
const ARC_DOWN_PATH = 'M0,0 L100,0 L100,44 Q50,64 0,44 Z';

/** SVG path for an upward arc (used by bottom nav). */
const ARC_UP_PATH = 'M0,30 Q50,0 100,30 L100,64 L0,64 Z';

/** SVG path for a plain rectangle with no arc. */
const RECT_PATH = 'M0,0 L100,0 L100,64 L0,64 Z';

/** Pre-computed style for down-arc variant. */
const arcDownHeightStyle: React.CSSProperties = { height: `calc(100% + ${ARC_OVERHANG_PX}px)` };

/** Pre-computed style for up-arc variant (bottom nav — larger overhang). */
const arcUpHeightStyle: React.CSSProperties = { height: `calc(100% + ${ARC_UP_OVERHANG_PX}px)` };

/** Pre-computed style for non-arc (rect) variant. */
const fullHeightStyle: React.CSSProperties = { height: '100%' };

interface ArcBackgroundProps {
  /** Which arc shape to render. */
  variant: 'down' | 'up' | 'rect';
  /** Extra classes on the <svg> element. */
  className?: string;
}

/**
 * Shared SVG background shape used by MobileTopBar, SubHeaderBar, and
 * MobileBottomNav. Draws a semi-transparent filled shape (rectangle + optional
 * curved arc) as a single path so there are no sub-pixel seams between layers.
 */
export function ArcBackground({ variant, className }: ArcBackgroundProps) {
  const path = variant === 'down' ? ARC_DOWN_PATH : variant === 'up' ? ARC_UP_PATH : RECT_PATH;
  const hasArc = variant !== 'rect';

  // "down" and "rect" anchor to the top (arc/content extends downward).
  // "up" anchors to the bottom so the arc extends upward above the container.
  const positionClass = variant === 'up'
    ? 'absolute bottom-0 left-0 right-0'
    : 'absolute inset-0';

  return (
    <svg
      className={cn(positionClass, 'w-full pointer-events-none', className)}
      viewBox="0 0 100 64"
      preserveAspectRatio="none"
      style={hasArc ? (variant === 'up' ? arcUpHeightStyle : arcDownHeightStyle) : fullHeightStyle}
    >
      <path d={path} className="fill-background/95" />
    </svg>
  );
}

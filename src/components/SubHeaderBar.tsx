import { cn } from '@/lib/utils';

interface SubHeaderBarProps {
  children: React.ReactNode;
  /** Extra classes on the outer wrapper (e.g. shrink-0). */
  className?: string;
  /** Extra classes on the inner flex container holding the tabs. */
  innerClassName?: string;
}

/**
 * Shared sticky sub-header bar with a unified arc+background drawn as a single
 * SVG shape. Eliminates the sub-pixel seam between a bg-background/80 container
 * and a separate SVG arc overlay that can appear during scroll/animation.
 *
 * Used by all tab bars (Feed, Search, Notifications, etc.) and the MobileTopBar
 * fallback arc.
 */
export function SubHeaderBar({ children, className, innerClassName }: SubHeaderBarProps) {
  return (
    <div className={cn('relative sticky top-mobile-bar sidebar:top-0 z-10', className)}>
      {/* Unified background: rectangle + arc drawn as one SVG path.
          Single fill layer = no opacity overlap seam, no sub-pixel gap. */}
      <svg
        className="absolute inset-0 w-full pointer-events-none"
        viewBox="0 0 100 64"
        preserveAspectRatio="none"
        style={{ height: 'calc(100% + 20px)' }}
      >
        <path d="M0,0 L100,0 L100,44 Q50,64 0,44 Z" className="fill-background/80" />
      </svg>
      {/* Tab content sits above the SVG background */}
      <div className={cn('relative flex overflow-x-auto scrollbar-none', innerClassName)}>
        {children}
      </div>
    </div>
  );
}

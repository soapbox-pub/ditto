import { cn } from '@/lib/utils';
import { ArcBackground } from '@/components/ArcBackground';

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
      <ArcBackground variant="down" />
      {/* Tab content sits above the SVG background */}
      <div className={cn('relative flex overflow-x-auto scrollbar-none', innerClassName)}>
        {children}
      </div>
    </div>
  );
}

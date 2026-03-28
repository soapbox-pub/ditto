import { useState } from 'react';
import { cn } from '@/lib/utils';
import { ArcBackground, ARC_OVERHANG_PX } from '@/components/ArcBackground';
import { useNavHidden } from '@/contexts/LayoutContext';

interface HoverSlice {
  left: number;
  width: number;
}

interface SubHeaderBarProps {
  children: React.ReactNode;
  /** Extra classes on the outer wrapper (e.g. shrink-0). */
  className?: string;
  /** Extra classes on the inner flex container holding the tabs. */
  innerClassName?: string;
  /** Replace the decorative arc with a plain rectangle. */
  noArc?: boolean;
}

interface SubHeaderBarContextValue {
  onHover: (slice: HoverSlice | null) => void;
  onActive: (slice: HoverSlice | null) => void;
}

import { createContext, useContext } from 'react';

export const SubHeaderBarContext = createContext<SubHeaderBarContextValue>({ onHover: () => {}, onActive: () => {} });

export function useSubHeaderBarHover() {
  return useContext(SubHeaderBarContext);
}

/**
 * Shared sticky sub-header bar with a unified arc+background drawn as a single
 * SVG shape. Eliminates the sub-pixel seam between a bg-background/80 container
 * and a separate SVG arc overlay that can appear during scroll/animation.
 *
 * Used by all tab bars (Feed, Search, Notifications, etc.) and the MobileTopBar
 * fallback arc.
 */
export function SubHeaderBar({ children, className, innerClassName, noArc }: SubHeaderBarProps) {
  const [hover, setHover] = useState<HoverSlice | null>(null);
  const [active, setActive] = useState<HoverSlice | null>(null);
  const navHidden = useNavHidden();

  return (
    <SubHeaderBarContext.Provider value={{ onHover: setHover, onActive: setActive }}>
      <div className={cn('relative sticky top-mobile-bar sidebar:top-0 sidebar:py-2 z-10 max-sidebar:transition-transform max-sidebar:duration-300 max-sidebar:ease-in-out', navHidden && 'nav-hidden-slide', className)}>
        <ArcBackground variant={noArc ? 'rect' : 'down'} />
        {/* Per-tab arc hover highlight: full-width arc, clipped to the hovered tab's x-slice */}
        {hover && !noArc && (
          <svg
            aria-hidden
            className="absolute top-0 left-0 w-full pointer-events-none"
            style={{
              height: `calc(100% + ${ARC_OVERHANG_PX}px)`,
              clipPath: `inset(0 calc(100% - ${hover.left + hover.width}px) 0 ${hover.left}px)`,
            }}
            viewBox="0 0 100 64"
            preserveAspectRatio="none"
          >
            <path d="M0,0 L100,0 L100,44 Q50,64 0,44 Z" className="fill-secondary/40" />
          </svg>
        )}
        {/* Active tab indicator: the arc's bottom edge as a stroke, clipped to the active tab's x-slice */}
        {active && !noArc && (
          <svg
            aria-hidden
            className="absolute top-0 left-0 w-full pointer-events-none"
            style={{
              height: `calc(100% + ${ARC_OVERHANG_PX}px)`,
              clipPath: `inset(0 calc(100% - ${active.left + active.width}px) 0 ${active.left}px)`,
            }}
            viewBox="0 0 100 64"
            preserveAspectRatio="none"
          >
            <path d="M100,44 Q50,64 0,44" fill="none" className="stroke-primary" strokeWidth="3" />
          </svg>
        )}
        {/* Tab content sits above the SVG background */}
        <div className={cn('relative flex overflow-x-auto scrollbar-none', innerClassName)}>
          {children}
        </div>
      </div>
    </SubHeaderBarContext.Provider>
  );
}

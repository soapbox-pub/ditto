import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ArcBackground, ARC_OVERHANG_PX } from '@/components/ArcBackground';
import { useNavHidden } from '@/contexts/LayoutContext';
import { SubHeaderBarContext } from '@/components/SubHeaderBarContext';

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
  /** Keep the bar visible when the mobile top bar hides (slides to top-0 instead of off-screen). */
  pinned?: boolean;
}

/**
 * Shared sticky sub-header bar with a unified arc+background drawn as a single
 * SVG shape. Eliminates the sub-pixel seam between a bg-background/80 container
 * and a separate SVG arc overlay that can appear during scroll/animation.
 *
 * Used by all tab bars (Feed, Search, Notifications, etc.) and the MobileTopBar
 * fallback arc.
 */
export function SubHeaderBar({ children, className, innerClassName, noArc, pinned }: SubHeaderBarProps) {
  const [hover, setHover] = useState<HoverSlice | null>(null);
  const [active, setActive] = useState<HoverSlice | null>(null);
  const navHidden = useNavHidden();

  // Track whether the sticky bar has actually reached the top of the viewport
  // by watching getBoundingClientRect().top on scroll. We show the safe-area
  // padding only once the bar's top edge is at or above the safe-area boundary,
  // preventing the spacer from appearing while the bar is still mid-page.
  const barRef = useRef<HTMLDivElement>(null);
  const [atTop, setAtTop] = useState(false);

  // Horizontal overflow scroll arrows (desktop only)
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkOverflow = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const tolerance = 2; // sub-pixel rounding tolerance
    setCanScrollLeft(el.scrollLeft > tolerance);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - tolerance);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    checkOverflow();
    el.addEventListener('scroll', checkOverflow, { passive: true });
    const ro = new ResizeObserver(checkOverflow);
    ro.observe(el);
    // Re-check when the tabs themselves change (added, removed, relabelled).
    // Watching the DOM rather than re-running on every `children` prop, which
    // is a new object each parent render and forced a layout read each time.
    let frame = 0;
    const mo = new MutationObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(checkOverflow);
    });
    mo.observe(el, { childList: true, subtree: true, characterData: true });
    return () => {
      el.removeEventListener('scroll', checkOverflow);
      ro.disconnect();
      mo.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [checkOverflow]);

  const scrollBy = (direction: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    const amount = el.clientWidth * 0.6;
    el.scrollBy({ left: direction === 'left' ? -amount : amount, behavior: 'smooth' });
  };

  useEffect(() => {
    if (!pinned) return;

    // Measure safe-area-inset-top once by reading it via a throw-away element.
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;top:var(--safe-area-inset-top,env(safe-area-inset-top,0px));left:0;width:0;height:0;visibility:hidden;pointer-events:none';
    document.body.appendChild(probe);
    const safeAreaTop = probe.getBoundingClientRect().top;
    document.body.removeChild(probe);

    const check = () => {
      const bar = barRef.current;
      if (!bar) return;
      setAtTop(bar.getBoundingClientRect().top <= safeAreaTop);
    };

    window.addEventListener('scroll', check, { passive: true });
    check();
    return () => window.removeEventListener('scroll', check);
  }, [pinned]);

  const showSafeAreaPadding = pinned && navHidden && atTop;

  // Stable, and skips identical slices: tabs re-report their position on
  // every scroll/resize, and a fresh object would re-render the bar each time.
  const contextValue = useMemo(() => {
    const keep = (set: React.Dispatch<React.SetStateAction<HoverSlice | null>>) =>
      (next: HoverSlice | null) =>
        set((prev) => (prev && next && prev.left === next.left && prev.width === next.width ? prev : next));
    return { onHover: keep(setHover), onActive: keep(setActive), scrollContainerRef: scrollRef };
  }, []);

  return (
    <SubHeaderBarContext.Provider value={contextValue}>
      <div
        ref={barRef}
        className={cn(
          'relative sticky top-mobile-bar sidebar:top-0 z-10',
          pinned
            ? 'max-sidebar:transition-[top,padding-top] max-sidebar:duration-300 max-sidebar:ease-in-out'
            : 'max-sidebar:transition-transform max-sidebar:duration-300 max-sidebar:ease-in-out',
          navHidden && (pinned ? 'max-sidebar:!top-0' : 'nav-hidden-slide'),
          showSafeAreaPadding && 'max-sidebar:safe-area-top',
          className,
        )}
      >
        {/* Safe-area fill — visible only when pinned and bar is at the top, covers the
            padding zone above the tabs with the same translucent bg as the MobileTopBar. */}
        {showSafeAreaPadding && (
          <div
            className="absolute top-0 left-0 right-0 bg-background/85 sidebar:hidden"
            style={{ height: 'var(--safe-area-inset-top, env(safe-area-inset-top, 0px))' }}
          />
        )}
        {/* Inner wrapper so ArcBackground covers only the tab area, not the safe-area padding above.
            sidebar:pt-2 adds desktop top padding inside the arc rather than outside it. */}
        <div className="relative sidebar:pt-2">
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
          <div className="relative">
            {/* Left scroll arrow — desktop only, shown when overflowing */}
            {canScrollLeft && (
              <button
                type="button"
                aria-label="Scroll tabs left"
                onClick={() => scrollBy('left')}
                className="hidden sidebar:flex absolute left-0 top-0 bottom-0 z-10 items-center pl-0.5 pr-1 bg-gradient-to-r from-background via-background to-transparent cursor-pointer"
              >
                <ChevronLeft className="size-4 text-foreground/60 drop-shadow-md" strokeWidth={4} />
              </button>
            )}
            <div
              ref={scrollRef}
              className={cn('relative flex overflow-x-auto scrollbar-none', innerClassName)}
            >
              {children}
            </div>
            {/* Right scroll arrow — desktop only, shown when overflowing */}
            {canScrollRight && (
              <button
                type="button"
                aria-label="Scroll tabs right"
                onClick={() => scrollBy('right')}
                className="hidden sidebar:flex absolute right-0 top-0 bottom-0 z-10 items-center pr-0.5 pl-1 bg-gradient-to-l from-background via-background to-transparent cursor-pointer"
              >
                <ChevronRight className="size-4 text-foreground/60 drop-shadow-md" strokeWidth={4} />
              </button>
            )}
          </div>
        </div>
      </div>
    </SubHeaderBarContext.Provider>
  );
}

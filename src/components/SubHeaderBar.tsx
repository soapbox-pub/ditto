import { useState, useRef, useEffect, useCallback, useContext, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useIntl } from 'react-intl';
import { cn } from '@/lib/utils';
import { ArcBackground, ARC_OVERHANG_PX } from '@/components/ArcBackground';
import { PageUnderlayContext } from '@/contexts/PageUnderlayContext';
import { SubHeaderBarContext } from '@/components/SubHeaderBarContext';

interface HoverSlice {
  left: number;
  width: number;
}

/** How far the active tab's line stops short of each tab edge, in px (room for its round caps). */
const ACTIVE_LINE_INSET_PX = 4;

/**
 * The piece of the arc's bottom edge (`M0,44 Q50,64 100,44` in ArcBackground's
 * 100×64 viewBox) between fractions `a` and `b` of the bar's width, as its own
 * quadratic so the stroke can end in round caps instead of being clipped.
 */
function arcEdgeSegment(a: number, b: number): string {
  const y = (t: number) => 44 + 40 * t * (1 - t);
  const cx = 50 * (a + b);
  const cy = 44 + 20 * (a + b) - 40 * a * b;
  return `M${100 * a},${y(a)} Q${cx},${cy} ${100 * b},${y(b)}`;
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
  /**
   * Lighter background that fades in from the top, so the bar blends into
   * the page above it. Goes solid at the top while stuck, so no see-through
   * band shows between it and the mobile top bar.
   */
  soft?: boolean;
}

/**
 * Shared sticky sub-header bar with a unified arc+background drawn as a single
 * SVG shape. Eliminates the sub-pixel seam between a bg-background/80 container
 * and a separate SVG arc overlay that can appear during scroll/animation.
 *
 * Used by all tab bars (Feed, Search, Notifications, etc.) and the MobileTopBar
 * fallback arc.
 */
export function SubHeaderBar({ children, className, innerClassName, noArc, pinned, soft }: SubHeaderBarProps) {
  const intl = useIntl();
  const [hover, setHover] = useState<HoverSlice | null>(null);
  const [active, setActive] = useState<HoverSlice | null>(null);
  const inUnderlay = useContext(PageUnderlayContext);

  // Whether the sticky bar has reached its sticky offset, watched through
  // getBoundingClientRect().top on scroll (only tracked for `pinned` and `soft`).
  // A pinned bar fills the safe area above it only then, so the fill never
  // shows while the bar is still mid-page.
  const barRef = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);

  // Width of the arc area, to turn the active tab's pixel slice into a
  // fraction of the curve.
  const arcRef = useRef<HTMLDivElement>(null);
  const [arcWidth, setArcWidth] = useState(0);
  useEffect(() => {
    const el = arcRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setArcWidth(el.offsetWidth));
    ro.observe(el);
    setArcWidth(el.offsetWidth);
    return () => ro.disconnect();
  }, []);

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
    if (!pinned && !soft) return;

    const check = () => {
      const bar = barRef.current;
      if (!bar) return;
      const top = bar.getBoundingClientRect().top;
      setStuck(top <= (parseFloat(getComputedStyle(bar).top) || 0) + 1);
    };

    // The copy of a page under a pushed one (BackSwipe) scrolls in a box of
    // its own, whose scroll events only reach the window while capturing.
    window.addEventListener('scroll', check, { passive: true, capture: inUnderlay });
    check();
    return () => window.removeEventListener('scroll', check, inUnderlay);
  }, [pinned, soft, inUnderlay]);

  // Underneath a pushed page (BackSwipe) the bars rest where they are.
  const follow = !inUnderlay;

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
          follow && (pinned ? 'chrome-follow-pinned' : 'chrome-follow chrome-follow-sub-header'),
          className,
        )}
      >
        {/* Safe-area fill — a stuck pinned bar covers the zone above it with the
            same translucent bg as the MobileTopBar, coming in as the top bar goes. */}
        {pinned && follow && stuck && (
          <div
            className="absolute bottom-full left-0 right-0 bg-background/85 sidebar:hidden"
            style={{ height: 'var(--safe-area-inset-top, env(safe-area-inset-top, 0px))', opacity: 'var(--chrome-hide, 0)' }}
          />
        )}
        {/* Inner wrapper so ArcBackground covers only the tab area, not the safe-area padding above.
            sidebar:pt-2 adds desktop top padding inside the arc rather than outside it. */}
        <div ref={arcRef} className="relative sidebar:pt-2">
          <ArcBackground
            variant={noArc ? 'rect' : 'down'}
            fillClassName={soft ? 'fill-background/70' : undefined}
            className={soft && !stuck ? '[mask-image:linear-gradient(to_bottom,transparent,#000_70%)]' : undefined}
          />
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
          {/* Active tab indicator: the stretch of the arc's bottom edge under the active tab, with round ends */}
          {active && !noArc && arcWidth > 0 && (() => {
            const a = Math.max(0, (active.left + ACTIVE_LINE_INSET_PX) / arcWidth);
            const b = Math.min(1, (active.left + active.width - ACTIVE_LINE_INSET_PX) / arcWidth);
            if (b <= a) return null;
            return (
              <svg
                aria-hidden
                className="absolute top-0 left-0 w-full overflow-visible pointer-events-none"
                style={{ height: `calc(100% + ${ARC_OVERHANG_PX}px)` }}
                viewBox="0 0 100 64"
                preserveAspectRatio="none"
              >
                <path
                  d={arcEdgeSegment(a, b)}
                  fill="none"
                  className="stroke-primary"
                  strokeWidth="4"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
            );
          })()}
          {/* Tab content sits above the SVG background */}
          <div className="relative">
            {/* Left scroll arrow — desktop only, shown when overflowing */}
            {canScrollLeft && (
              <button
                type="button"
                aria-label={intl.formatMessage({ id: 'subHeaderBar.scrollLeft', defaultMessage: 'Scroll tabs left' })}
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
                aria-label={intl.formatMessage({ id: 'subHeaderBar.scrollRight', defaultMessage: 'Scroll tabs right' })}
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

import { createContext, useContext, useCallback, useLayoutEffect, useEffect } from 'react';

interface HoverSlice {
  left: number;
  width: number;
}

interface SubHeaderBarContextValue {
  onHover: (slice: HoverSlice | null) => void;
  onActive: (slice: HoverSlice | null) => void;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
}

export const SubHeaderBarContext = createContext<SubHeaderBarContextValue>({ onHover: () => {}, onActive: () => {}, scrollContainerRef: { current: null } });

export function useSubHeaderBarHover() {
  return useContext(SubHeaderBarContext);
}

/**
 * Shared hook for reporting the active tab's position to SubHeaderBar's arc indicator.
 * Handles scroll-aware position reporting and cleans up on unmount/deactivation.
 *
 * @param active  Whether this tab is currently active.
 * @param elRef   Ref to the tab's DOM element (used for offsetLeft/offsetWidth).
 */
export function useActiveTabIndicator(active: boolean, elRef: React.RefObject<HTMLElement | null>) {
  const { onActive, scrollContainerRef } = useSubHeaderBarHover();

  const reportSlice = useCallback(() => {
    const el = elRef.current;
    if (!el) return null;
    const container = scrollContainerRef.current;
    const scrollOffset = container?.scrollLeft ?? 0;
    // Account for the scroll container's own offset within its parent
    // (e.g. when innerClassName adds mx-auto centering).
    const containerOffset = container?.offsetLeft ?? 0;
    return { left: el.offsetLeft - scrollOffset + containerOffset, width: el.offsetWidth };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Report active slice to SubHeaderBar so the arc indicator renders.
  // Schedule a second report after paint so that layout-dependent values
  // (e.g. offsetLeft from mx-auto centering) are fully resolved.
  useLayoutEffect(() => {
    if (!active) return;
    const s = reportSlice();
    if (s) onActive(s);

    const raf = requestAnimationFrame(() => {
      const updated = reportSlice();
      if (updated) onActive(updated);
    });

    return () => {
      cancelAnimationFrame(raf);
      onActive(null);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // Re-report position when the scroll container scrolls or resizes,
  // so the SVG clip-path stays aligned with the visually shifted tab.
  useEffect(() => {
    if (!active) return;
    const container = scrollContainerRef.current;
    if (!container) return;
    const update = () => {
      const s = reportSlice();
      if (s) onActive(s);
    };
    container.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(container);
    return () => {
      container.removeEventListener('scroll', update);
      ro.disconnect();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return { reportSlice };
}

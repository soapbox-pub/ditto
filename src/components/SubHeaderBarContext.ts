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
    const scrollOffset = scrollContainerRef.current?.scrollLeft ?? 0;
    return { left: el.offsetLeft - scrollOffset, width: el.offsetWidth };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Report active slice to SubHeaderBar so the arc indicator renders.
  useLayoutEffect(() => {
    if (!active) return;
    const s = reportSlice();
    if (s) onActive(s);
    return () => onActive(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // Re-report position when the scroll container scrolls,
  // so the SVG clip-path stays aligned with the visually shifted tab.
  useEffect(() => {
    if (!active) return;
    const container = scrollContainerRef.current;
    if (!container) return;
    const handleScroll = () => {
      const s = reportSlice();
      if (s) onActive(s);
    };
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return { reportSlice };
}

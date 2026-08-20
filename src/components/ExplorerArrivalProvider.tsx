import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';

import {
  ExplorerArrivalContext,
  type ExplorerArrivalState,
} from '@/contexts/ExplorerArrivalContext';

/**
 * A destination smaller than this in either dimension is treated as unmeasurable
 * — it is almost certainly collapsed, `display:none`, or mid-layout, and flying
 * a card into it would look like the card vanishing into a point.
 */
const MIN_TARGET_SIZE = 24;

/**
 * How far off screen a destination may sit and still be a valid target. A
 * destination scrolled out of view is a real possibility on mobile; sending the
 * card to it would animate off the edge of the screen, so those cases fall back
 * to an in-place crossfade instead.
 */
const OFFSCREEN_TOLERANCE = 8;

/**
 * Provides the arrival → Explorer-surface handoff coordinator.
 *
 * Wraps both the application and the arrival overlay so the overlay can measure
 * a destination that lives deep inside the router, and so the destination knows
 * to stay hidden until the travelling copy has arrived.
 *
 * Ownership is in-memory on purpose. If the page reloads mid-transition the
 * provider starts fresh with `owning: false`, so the destination is visible
 * immediately — a refresh can never leave the Explorer surface permanently
 * hidden, whatever happened to the animation.
 */
export function ExplorerArrivalProvider({ children }: { children: ReactNode }) {
  const [owning, setOwning] = useState(false);
  // A *set* of candidates, not a single slot. Both Explorer surfaces are
  // mounted at once above the `lg` breakpoint — the sidebar widget and the
  // mobile Home teaser, which is hidden with `lg:hidden`, i.e. still mounted and
  // still registering itself. A single slot made the destination a function of
  // registration order: whichever surface happened to attach its ref last won,
  // and when that was the CSS-hidden teaser the card measured nothing (a
  // `display: none` element has no box), fell back to shrinking in place, and so
  // appeared to fly to the centre/mobile destination on a desktop layout.
  const targetsRef = useRef<Set<HTMLElement>>(new Set());

  const claim = useCallback(() => setOwning(true), []);
  const release = useCallback(() => setOwning(false), []);

  const addTarget = useCallback((element: HTMLElement) => {
    targetsRef.current.add(element);
  }, []);

  const removeTarget = useCallback((element: HTMLElement) => {
    targetsRef.current.delete(element);
  }, []);

  const measureTarget = useCallback((): DOMRect | null => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let best: DOMRect | null = null;
    for (const element of targetsRef.current) {
      // A detached node keeps answering `getBoundingClientRect` (with zeros),
      // so this is what stops an unmounted surface from being measured at all.
      if (!element.isConnected) {
        targetsRef.current.delete(element);
        continue;
      }

      const rect = element.getBoundingClientRect();
      // Collapsed, `display: none`, or mid-layout. This is the whole breakpoint
      // rule: the surface the current layout hides has no box, so it loses
      // without anyone consulting a viewport width.
      if (rect.width < MIN_TARGET_SIZE || rect.height < MIN_TARGET_SIZE) continue;

      // Reject a destination that isn't meaningfully on screen. The caller then
      // uses the safe fallback rather than animating toward somewhere the user
      // cannot see.
      const onScreen =
        rect.bottom > OFFSCREEN_TOLERANCE &&
        rect.right > OFFSCREEN_TOLERANCE &&
        rect.top < viewportHeight - OFFSCREEN_TOLERANCE &&
        rect.left < viewportWidth - OFFSCREEN_TOLERANCE;
      if (!onScreen) continue;

      // Should not happen — the two surfaces are complementary — but if a layout
      // ever shows both, prefer the larger one and never the iteration order.
      if (!best || rect.width * rect.height > best.width * best.height) best = rect;
    }

    return best;
  }, []);

  const value = useMemo<ExplorerArrivalState>(
    () => ({ owning, claim, release, addTarget, removeTarget, measureTarget }),
    [owning, claim, release, addTarget, removeTarget, measureTarget],
  );

  return (
    <ExplorerArrivalContext.Provider value={value}>{children}</ExplorerArrivalContext.Provider>
  );
}

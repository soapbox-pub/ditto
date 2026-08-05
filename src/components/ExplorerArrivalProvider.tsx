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
  const targetRef = useRef<HTMLElement | null>(null);

  const claim = useCallback(() => setOwning(true), []);
  const release = useCallback(() => setOwning(false), []);

  const registerTarget = useCallback((element: HTMLElement | null) => {
    targetRef.current = element;
  }, []);

  const measureTarget = useCallback((): DOMRect | null => {
    const element = targetRef.current;
    if (!element || !element.isConnected) return null;

    const rect = element.getBoundingClientRect();
    if (rect.width < MIN_TARGET_SIZE || rect.height < MIN_TARGET_SIZE) return null;

    // Reject a destination that isn't meaningfully on screen. The caller then
    // uses the safe fallback rather than animating toward somewhere the user
    // cannot see.
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const onScreen =
      rect.bottom > OFFSCREEN_TOLERANCE &&
      rect.right > OFFSCREEN_TOLERANCE &&
      rect.top < viewportHeight - OFFSCREEN_TOLERANCE &&
      rect.left < viewportWidth - OFFSCREEN_TOLERANCE;

    return onScreen ? rect : null;
  }, []);

  const value = useMemo<ExplorerArrivalState>(
    () => ({ owning, claim, release, registerTarget, measureTarget }),
    [owning, claim, release, registerTarget, measureTarget],
  );

  return (
    <ExplorerArrivalContext.Provider value={value}>{children}</ExplorerArrivalContext.Provider>
  );
}

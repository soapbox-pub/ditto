import { createContext, useContext } from 'react';

/**
 * Coordinates the shared-element handoff between the arrival overlay's central
 * Ditto Explorer card and the persistent Explorer surface it becomes.
 *
 * The two are meant to read as **the same object**: a large presentation that
 * travels to its home rather than one component fading out while an unrelated
 * one fades in. That needs three things the components can't arrange alone —
 * the overlay must be able to measure where the destination will be, the
 * destination must stay out of sight until the travelling copy arrives, and
 * both must agree on exactly when the handoff happens.
 *
 * This carries **no mission state**. It never acknowledges, postpones, hides,
 * completes, or publishes anything; it is purely about where pixels go.
 */
export interface ExplorerArrivalState {
  /**
   * True while the arrival overlay owns the Explorer visual — the destination
   * is mounted and laid out (so it can be measured, and so no layout shift
   * happens at handoff) but not painted.
   */
  owning: boolean;
  /** Take ownership; called when the arrival sequence begins. */
  claim: () => void;
  /** Release ownership; the destination becomes visible and interactive. */
  release: () => void;
  /**
   * Register the live destination element — the desktop sidebar widget or the
   * mobile Home teaser, whichever is mounted. Registering `null` unregisters.
   */
  registerTarget: (element: HTMLElement | null) => void;
  /**
   * The destination's current bounding box, or `null` when no destination is
   * mounted or it isn't usefully on screen. The overlay measures at the moment
   * it starts travelling rather than caching, so a resize, a route change, or a
   * sidebar of a different width is always accounted for.
   */
  measureTarget: () => DOMRect | null;
}

const NOOP_STATE: ExplorerArrivalState = {
  owning: false,
  claim: () => {},
  release: () => {},
  registerTarget: () => {},
  measureTarget: () => null,
};

export const ExplorerArrivalContext = createContext<ExplorerArrivalState>(NOOP_STATE);

/**
 * Read the arrival handoff coordinator.
 *
 * Defaults to an inert implementation, so any surface rendered outside the
 * provider (tests, storybook-style harnesses) simply behaves as though no
 * arrival is in progress — visible and interactive.
 */
export function useExplorerArrival(): ExplorerArrivalState {
  return useContext(ExplorerArrivalContext);
}

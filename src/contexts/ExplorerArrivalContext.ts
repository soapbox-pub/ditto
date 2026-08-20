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
   * Offer an element as a *candidate* destination.
   *
   * Candidates are a set, not a slot. More than one Explorer surface is mounted
   * at once on a wide screen — the desktop sidebar widget and the mobile Home
   * teaser, the latter hidden only by CSS (`lg:hidden`) — and there is no
   * ordering between their registrations that is safe to rely on. Which one is
   * the real destination is decided at measurement time, from layout, by
   * {@link measureTarget}.
   */
  addTarget: (element: HTMLElement) => void;
  /** Withdraw a candidate (unmount, or the ref being replaced). */
  removeTarget: (element: HTMLElement) => void;
  /**
   * The bounding box of the destination that is *actually on screen right now*,
   * or `null` when none is.
   *
   * Chosen, not remembered: every registered candidate is measured and the ones
   * that are detached, collapsed, `display: none`, or scrolled out of view are
   * discarded. That is what makes the choice correct without the transition
   * knowing a single breakpoint — a CSS-hidden surface has no box, so it cannot
   * win, and a resize across the breakpoint simply changes which candidate has
   * one. The caller re-measures every frame, so the answer follows the layout
   * even mid-flight.
   */
  measureTarget: () => DOMRect | null;
}

const NOOP_STATE: ExplorerArrivalState = {
  owning: false,
  claim: () => {},
  release: () => {},
  addTarget: () => {},
  removeTarget: () => {},
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

/**
 * useRouteReaction Hook
 *
 * Thin orchestration layer for page-transition reactions.
 *
 * On route change the companion briefly stops and looks toward the
 * top-center of the main content area for a random 2-6 seconds,
 * then resumes normal behavior automatically.
 *
 * Architecture:
 *   - Watches pathname for changes (after the initial entry has completed)
 *   - Fires a single triggerAttention call targeting the main content area
 *   - Cancels fully on new route change, drag, or component unmount
 *
 * Future custom reactions:
 *   Add entries to ROUTE_REACTIONS to override the generic behavior for
 *   specific routes. Each entry receives a context object with
 *   triggerAttention and a timeouts array (auto-cancelled on next change).
 */

import { useEffect, useRef, useCallback } from 'react';

import type { Position, AttentionPriority } from '../types/companion.types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TriggerAttentionFn {
  (position: Position, options?: {
    duration?: number;
    priority?: AttentionPriority;
    source?: string;
    isGlance?: boolean;
    bypassCooldown?: boolean;
  }): void;
}

interface UseRouteReactionOptions {
  /** Current pathname from useLocation */
  pathname: string;
  /** Trigger a single attention target */
  triggerAttention: TriggerAttentionFn;
  /** Clear any current attention */
  clearAttention: () => void;
  /** Whether the companion has completed its first entry */
  hasEnteredOnce: boolean;
  /** Whether entry animation is currently playing */
  isEntering: boolean;
  /** Whether the companion is being dragged */
  isDragging: boolean;
}

/** Context passed to custom route-reaction functions. */
interface RouteReactionContext {
  pathname: string;
  prevPathname: string;
  triggerAttention: TriggerAttentionFn;
  clearAttention: () => void;
  /** Push timeout IDs here — they are auto-cancelled on next route change. */
  timeouts: ReturnType<typeof setTimeout>[];
}

type RouteReactionFn = (ctx: RouteReactionContext) => void;

// ─── Custom Route Reaction Map ────────────────────────────────────────────────
//
// Add entries here to override the generic reaction for specific routes.
//
// Example (not implemented yet):
//   '/treasures': (ctx) => { /* special treasure-chest reaction */ },
//   '/blobbi': (ctx) => { /* special blobbi-page reaction */ },
//

const ROUTE_REACTIONS: Record<string, RouteReactionFn> = {
  // intentionally empty — generic fallback handles all routes for now
};

// ─── Timing ───────────────────────────────────────────────────────────────────

/** Min/max duration for the generic route-change look (ms) */
const LOOK_DURATION_MIN = 2000;
const LOOK_DURATION_MAX = 6000;

/** Delay before starting the reaction after route change (ms).
 *  Gives the new page's DOM time to mount. */
const ROUTE_REACTION_DELAY = 250;

// ─── Layout helper ────────────────────────────────────────────────────────────

/**
 * Find the center-top of the main content column.
 *
 * Reads live DOM rects so the position reflects the current layout.
 * Falls back to viewport center-top if no content element is found.
 */
function findMainContentPosition(): Position {
  const selectors = [
    'main',
    '[role="main"]',
    '.main-content',
    '#main-content',
  ];

  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) {
      const rect = el.getBoundingClientRect();
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + Math.min(rect.height * 0.3, 200),
      };
    }
  }

  // Fallback: center-top of current viewport
  return {
    x: window.innerWidth / 2,
    y: window.innerHeight * 0.25,
  };
}

// ─── Generic reaction ─────────────────────────────────────────────────────────

/**
 * Default route reaction: look at the top-center of the main content area
 * for a random 2-6 seconds.
 */
function genericRouteReaction(ctx: RouteReactionContext): void {
  const position = findMainContentPosition();
  const duration = LOOK_DURATION_MIN + Math.random() * (LOOK_DURATION_MAX - LOOK_DURATION_MIN);

  ctx.triggerAttention(position, {
    duration,
    priority: 'normal',
    source: 'route:center',
    bypassCooldown: true, // Previous attention was kept alive during the delay
  });
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useRouteReaction({
  pathname,
  triggerAttention,
  clearAttention,
  hasEnteredOnce,
  isEntering,
  isDragging,
}: UseRouteReactionOptions): void {
  const prevPathnameRef = useRef(pathname);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  /** Cancel pending timeouts only — does NOT clear the active attention.
   *  Used during route transitions so the previous gaze target stays alive
   *  until the new one is ready (avoids a random-gaze gap). */
  const cancelPendingTimeouts = useCallback(() => {
    for (const tid of timeoutsRef.current) {
      clearTimeout(tid);
    }
    timeoutsRef.current = [];
  }, []);

  /** Full cancel: pending timeouts + active attention.
   *  Used when dragging or when the reaction should fully stop. */
  const cancelReaction = useCallback(() => {
    cancelPendingTimeouts();
    clearAttention();
  }, [cancelPendingTimeouts, clearAttention]);

  // Cancel fully on drag (pending timeouts + active attention)
  useEffect(() => {
    if (isDragging) {
      cancelReaction();
    }
  }, [isDragging, cancelReaction]);

  // Main route-change effect
  useEffect(() => {
    // Skip until companion has completed its first entry animation
    if (!hasEnteredOnce) {
      prevPathnameRef.current = pathname;
      return;
    }

    // Skip if pathname hasn't actually changed
    if (pathname === prevPathnameRef.current) return;

    // Skip while entry animation is playing (first-entry post-route attention handles this)
    if (isEntering) {
      prevPathnameRef.current = pathname;
      return;
    }

    const prevPathname = prevPathnameRef.current;
    prevPathnameRef.current = pathname;

    // Cancel pending timeouts from a previous route change.
    cancelPendingTimeouts();

    // Immediately set a preliminary attention target at viewport center-top
    // so the gaze system never falls to random/mouse-follow mode during the
    // delay.  This is a cheap viewport-only calculation (no DOM query) so it
    // is safe to call synchronously.  The delayed reaction below will replace
    // it with a precise DOM-measured position.
    triggerAttention(
      { x: window.innerWidth / 2, y: window.innerHeight * 0.25 },
      { duration: LOOK_DURATION_MAX, priority: 'normal', source: 'route:preliminary', bypassCooldown: true },
    );

    // Small delay to let the new page's DOM mount before querying positions
    const startTid = setTimeout(() => {
      const ctx: RouteReactionContext = {
        pathname,
        prevPathname,
        triggerAttention,
        clearAttention,
        timeouts: timeoutsRef.current,
      };

      // Look up a custom reaction, falling back to generic
      const customReaction = ROUTE_REACTIONS[pathname];
      if (customReaction) {
        customReaction(ctx);
      } else {
        genericRouteReaction(ctx);
      }
    }, ROUTE_REACTION_DELAY);

    timeoutsRef.current.push(startTid);

    return () => {
      // Effect cleanup (re-fire or unmount): only cancel timeouts.
      // Attention auto-clears via its own duration timeout.
      cancelPendingTimeouts();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- triggerAttention/clearAttention are stable callbacks
  }, [pathname, hasEnteredOnce, isEntering, cancelPendingTimeouts]);
}

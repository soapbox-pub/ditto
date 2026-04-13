/**
 * useRouteReaction Hook
 *
 * Thin orchestration layer for page-transition reactions.
 *
 * On route change the companion:
 *   1. Glances briefly at the click origin (sidebar button, etc.) — ~700ms
 *   2. Then looks at the top-center of the main content area for 2-6 seconds
 * If no recent click is available (programmatic navigation), step 1 is
 * skipped and the companion looks at center-top immediately.
 *
 * Architecture:
 *   - Tracks the last pointerdown position in a ref (no re-renders)
 *   - Watches pathname for changes (after the initial entry has completed)
 *   - Fires triggerAttention calls for the two-phase gaze sequence
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

/** Duration of the initial click-origin glance (ms). */
const CLICK_GLANCE_DURATION = 700;

/** A click is considered "recent" if it happened within this window (ms).
 *  Covers the time between pointerdown and React Router committing the
 *  new pathname — usually <200ms, but we allow a generous margin. */
const CLICK_RECENCY_THRESHOLD = 1000;

/** Delay before starting the center-content reaction after route change (ms).
 *  Gives the new page's DOM time to mount.  When the click-origin glance is
 *  active this delay runs concurrently (the glance keeps gaze occupied). */
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

  /** Last pointerdown target + raw coordinates + timestamp.
   *  We store the nearest clickable element so we can re-read its live
   *  bounding rect at route-change time (accounts for scroll shifts
   *  between click and React effect).  Raw coordinates serve as fallback
   *  if the element is unmounted by the time the effect runs. */
  const lastClickRef = useRef<{ element: Element | null; fallback: Position; time: number } | null>(null);

  // Track pointer-down position + element (passive, no re-renders)
  useEffect(() => {
    const handler = (e: PointerEvent) => {
      // Find the nearest clickable ancestor so we measure the full
      // button/link area rather than a child icon or text span.
      // Returns null when the click is not inside a recognized control.
      const el = e.target instanceof Element
        ? e.target.closest('a, button, [role="button"]')
        : null;

      lastClickRef.current = {
        element: el,
        fallback: { x: e.clientX, y: e.clientY },
        time: Date.now(),
      };
    };
    window.addEventListener('pointerdown', handler, { passive: true });
    return () => window.removeEventListener('pointerdown', handler);
  }, []);

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

    // ── Phase 1: Glance at click origin (if a recent click exists) ──────
    // Check whether a recent pointer-down triggered this navigation.
    const click = lastClickRef.current;
    const hasRecentClick = click && (Date.now() - click.time) < CLICK_RECENCY_THRESHOLD;

    // Delay before firing the center-content reaction.  When the click
    // glance is active, this is the *longer* of glance duration and the
    // DOM-mount delay so the glance is never cut short.
    let centerDelay: number;

    if (hasRecentClick) {
      // Resolve the click position from the live element rect when possible.
      // This accounts for scroll changes between pointerdown and now.
      let clickPos: Position;
      if (click.element && click.element.isConnected) {
        const rect = click.element.getBoundingClientRect();
        clickPos = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      } else {
        clickPos = click.fallback;
      }

      // Clamp Y so Blobbi looks *across* toward the sidebar, not sharply
      // downward when the clicked item is near the bottom of the viewport.
      const maxY = window.innerHeight * 0.55;
      if (clickPos.y > maxY) {
        clickPos = { x: clickPos.x, y: maxY };
      }

      // Glance at the click origin — keeps gaze occupied during the delay.
      triggerAttention(
        clickPos,
        { duration: CLICK_GLANCE_DURATION + ROUTE_REACTION_DELAY, priority: 'normal', source: 'route:click-origin', bypassCooldown: true },
      );
      centerDelay = Math.max(CLICK_GLANCE_DURATION, ROUTE_REACTION_DELAY);
    } else {
      // No click — fall back to immediate center-top preliminary (programmatic navigation).
      triggerAttention(
        { x: window.innerWidth / 2, y: window.innerHeight * 0.25 },
        { duration: LOOK_DURATION_MAX, priority: 'normal', source: 'route:preliminary', bypassCooldown: true },
      );
      centerDelay = ROUTE_REACTION_DELAY;
    }

    // ── Phase 2: Look at center-top of the new page ─────────────────────
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
    }, centerDelay);

    timeoutsRef.current.push(startTid);

    return () => {
      // Effect cleanup (re-fire or unmount): only cancel timeouts.
      // Attention auto-clears via its own duration timeout.
      cancelPendingTimeouts();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- triggerAttention/clearAttention are stable callbacks
  }, [pathname, hasEnteredOnce, isEntering, cancelPendingTimeouts]);
}

/**
 * useRouteReaction Hook
 *
 * Thin orchestration layer for page-transition reactions.
 *
 * On route change the companion briefly pauses and scans the layout areas
 * that changed (center content first, then right sidebar if present),
 * using the existing attention system for each step.
 *
 * Architecture:
 *   - Watches pathname for changes (after the initial entry has completed)
 *   - Determines which layout columns changed
 *   - Fires a sequence of triggerAttention calls with setTimeout chaining
 *   - Cancels the sequence on new route change, drag, or higher-priority attention
 *
 * Future custom reactions:
 *   Add entries to ROUTE_REACTIONS to override the generic scan for specific
 *   routes. Each entry receives a context object with triggerAttention and a
 *   timeouts array (auto-cancelled on next route change).
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
  /** Current viewport dimensions */
  viewport: { width: number; height: number };
}

/** Context passed to custom route-reaction functions. */
interface RouteReactionContext {
  pathname: string;
  prevPathname: string;
  triggerAttention: TriggerAttentionFn;
  clearAttention: () => void;
  viewport: { width: number; height: number };
  /** Push timeout IDs here — they are auto-cancelled on next route change. */
  timeouts: ReturnType<typeof setTimeout>[];
}

type RouteReactionFn = (ctx: RouteReactionContext) => void;

// ─── Custom Route Reaction Map ────────────────────────────────────────────────
//
// Add entries here to override the generic scan for specific routes.
//
// Example (not implemented yet):
//   '/treasures': (ctx) => { /* special treasure-chest reaction */ },
//   '/blobbi': (ctx) => { /* special blobbi-page reaction */ },
//

const ROUTE_REACTIONS: Record<string, RouteReactionFn> = {
  // intentionally empty — generic fallback handles all routes for now
};

// ─── Timing ───────────────────────────────────────────────────────────────────

/** Duration per area in the generic scan sequence (ms) */
const SCAN_STEP_DURATION = 1200;

/** Delay before starting the reaction after route change (ms).
 *  Gives the new page's DOM time to mount. */
const ROUTE_REACTION_DELAY = 250;

// ─── Layout helpers ───────────────────────────────────────────────────────────

/** Find the center-top of the main content column. */
function findMainContentPosition(viewport: { width: number; height: number }): Position | null {
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

  // Fallback: center-top of viewport
  return { x: viewport.width / 2, y: viewport.height * 0.25 };
}

/**
 * Find the center-top of a visible right sidebar.
 *
 * Returns null when:
 *  - The sidebar is the empty 300px placeholder (no meaningful content)
 *  - The sidebar is not visible (below xl breakpoint)
 *  - No sidebar element is found at all
 *
 * Detection is conservative: we look for the element that MainLayout renders
 * *after* the center column, check that it is visible and has children beyond
 * a single empty placeholder div.
 */
function findRightSidebarPosition(): Position | null {
  // MainLayout renders: <div class="flex justify-center …"> → LeftSidebar | CenterColumn | RightSidebar
  // The right sidebar is the last child of the flex container.
  // When a page provides a custom sidebar, it replaces the placeholder entirely.
  // The placeholder is: <div class="w-[300px] shrink-0 hidden xl:block" /> (no children).
  const flexContainer = document.querySelector('.flex.justify-center');
  if (!flexContainer) return null;

  const lastChild = flexContainer.lastElementChild;
  if (!lastChild) return null;

  // The empty placeholder has no children — skip it
  if (lastChild.children.length === 0) return null;

  // Must be visible on screen (right sidebars are hidden below xl)
  const rect = lastChild.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;

  return {
    x: rect.left + rect.width / 2,
    y: rect.top + Math.min(rect.height * 0.3, 200),
  };
}

// ─── Generic reaction ─────────────────────────────────────────────────────────

/**
 * Default route reaction: scan changed layout areas left-to-right.
 *
 * Center content is always considered changed.
 * Right sidebar is included only if a non-placeholder sidebar is detected.
 */
function genericRouteReaction(ctx: RouteReactionContext): void {
  const targets: { position: Position; source: string }[] = [];

  // Center (always changes on route navigation)
  const center = findMainContentPosition(ctx.viewport);
  if (center) {
    targets.push({ position: center, source: 'route:center' });
  }

  // Right sidebar (only if a real sidebar is rendered)
  const right = findRightSidebarPosition();
  if (right) {
    targets.push({ position: right, source: 'route:right-sidebar' });
  }

  if (targets.length === 0) return;

  // Fire the first target immediately
  ctx.triggerAttention(targets[0].position, {
    duration: SCAN_STEP_DURATION,
    priority: 'normal',
    source: targets[0].source,
  });

  // Chain remaining targets
  let delay = SCAN_STEP_DURATION;
  for (let i = 1; i < targets.length; i++) {
    const target = targets[i];
    const tid = setTimeout(() => {
      ctx.triggerAttention(target.position, {
        duration: SCAN_STEP_DURATION,
        priority: 'normal',
        source: target.source,
      });
    }, delay);
    ctx.timeouts.push(tid);
    delay += SCAN_STEP_DURATION;
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useRouteReaction({
  pathname,
  triggerAttention,
  clearAttention,
  hasEnteredOnce,
  isEntering,
  isDragging,
  viewport,
}: UseRouteReactionOptions): void {
  const prevPathnameRef = useRef(pathname);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  /** Cancel all queued sequence steps. */
  const cancelSequence = useCallback(() => {
    for (const tid of timeoutsRef.current) {
      clearTimeout(tid);
    }
    timeoutsRef.current = [];
  }, []);

  // Cancel sequence on drag
  useEffect(() => {
    if (isDragging) {
      cancelSequence();
    }
  }, [isDragging, cancelSequence]);

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

    // Cancel any in-flight sequence from a previous route change
    cancelSequence();
    clearAttention();

    // Small delay to let the new page's DOM mount
    const startTid = setTimeout(() => {
      // Build shared timeout tracker for this sequence
      const sequenceTimeouts = timeoutsRef.current;

      const ctx: RouteReactionContext = {
        pathname,
        prevPathname,
        triggerAttention,
        clearAttention,
        viewport,
        timeouts: sequenceTimeouts,
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

    // Cleanup on unmount
    return () => {
      cancelSequence();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- triggerAttention/clearAttention are stable callbacks; viewport changes should not restart the effect
  }, [pathname, hasEnteredOnce, isEntering, cancelSequence]);
}

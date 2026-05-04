/**
 * useFoodDrag — Manages drag-to-feed interaction for food items.
 *
 * Architecture:
 *   - The carousel button only handles `pointerdown` to START a drag.
 *   - Once started, the hook attaches native `window` listeners for
 *     `pointermove`, `pointerup`, `pointercancel`, and `blur`.
 *   - These global listeners own the drag until it ends.
 *   - The carousel button plays no further role in the drag lifecycle.
 *
 * This eliminates all bugs caused by:
 *   - Button-level handlers being swapped out by React re-renders
 *   - Pointer capture being released before state cleanup
 *   - Coalesced events firing between capture release and ref clear
 *   - Stale closures from React batching or handler recreation
 *
 * Performance:
 *   Pointer position is tracked via refs and applied to the ghost element
 *   through direct DOM mutation.  React state only changes on drag
 *   start / end — never during pointermove — so the parent tree stays still.
 *
 * Safety:
 *   - `activePointerIdRef` rejects events from any other pointer.
 *   - `sessionRef` (monotonic counter) invalidates stale listeners.
 *   - `cleanup()` is idempotent and runs on end, cancel, blur, and unmount.
 */

import { useState, useCallback, useRef, useEffect } from 'react';

// ─── Debug ────────────────────────────────────────────────────────────────────

/** Flip to `true` during development to trace the full drag lifecycle. */
const DEBUG_FOOD_DRAG = import.meta.env.DEV && false;

function dbg(...args: unknown[]) {
  if (DEBUG_FOOD_DRAG) console.log('[food-drag]', ...args);
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Distance (px) from mouth center to trigger open-mouth / drop-to-eat. */
const MOUTH_THRESHOLD = 80;

/** Mouth anchor as proportion of the visual container. */
const MOUTH_X_RATIO = 0.5;
const MOUTH_Y_RATIO = 0.67;

/** Sentinel: no pointer is active. */
const NO_POINTER = -1;

// ─── Types ────────────────────────────────────────────────────────────────────

/** Drag identity exposed via React state (drives mount/unmount of the ghost). */
export interface FoodDragState {
  itemId: string;
  emoji: string;
  /** Initial pointer coords — seeds the ghost's first-paint position. */
  startX: number;
  startY: number;
}

export interface UseFoodDragReturn {
  /** Non-null while a drag is active.  Drives ghost rendering. */
  drag: FoodDragState | null;
  /** Attach to the ghost overlay div.  The hook positions it directly. */
  ghostRef: React.RefObject<HTMLDivElement | null>;
  /** Call on pointerdown on a food item to begin a drag session.
   *  After this, the hook owns the lifecycle via global listeners. */
  onDragStart: (e: React.PointerEvent, itemId: string, emoji: string) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getMouthCenter(): { mx: number; my: number } | null {
  const el = document.querySelector<HTMLElement>('[data-blobbi-visual]');
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  return {
    mx: rect.left + rect.width * MOUTH_X_RATIO,
    my: rect.top + rect.height * MOUTH_Y_RATIO,
  };
}

function isNearMouth(px: number, py: number): boolean {
  const mouth = getMouthCenter();
  if (!mouth) return false;
  const dx = px - mouth.mx;
  const dy = py - mouth.my;
  return Math.sqrt(dx * dx + dy * dy) <= MOUTH_THRESHOLD;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useFoodDrag(
  onFeed: (itemId: string) => void,
  onNearMouthChange?: (near: boolean) => void,
): UseFoodDragReturn {
  // React state — only set on drag start (non-null) and end (null).
  const [drag, setDrag] = useState<FoodDragState | null>(null);

  // Mutable session state — read/written only in native event handlers.
  const activePointerIdRef = useRef(NO_POINTER);
  const itemIdRef = useRef<string | null>(null);
  const nearRef = useRef(false);
  const sessionRef = useRef(0);   // monotonic; stale listeners bail

  // Latest callbacks — stored in refs so global listeners always call
  // the freshest version without needing to detach/reattach.
  const onFeedRef = useRef(onFeed);
  onFeedRef.current = onFeed;
  const onNearMouthChangeRef = useRef(onNearMouthChange);
  onNearMouthChangeRef.current = onNearMouthChange;

  // Ghost DOM ref — positioned imperatively, never through React state.
  const ghostRef = useRef<HTMLDivElement | null>(null);

  // ── Ghost helpers ──────────────────────────────────────────────────────

  const moveGhost = useCallback((x: number, y: number) => {
    const el = ghostRef.current;
    if (!el) return;
    el.style.display = '';
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
  }, []);

  const hideGhost = useCallback(() => {
    const el = ghostRef.current;
    if (!el) return;
    el.style.display = 'none';
    if (el.firstElementChild) {
      el.firstElementChild.classList.remove('scale-75');
    }
  }, []);

  // ── Cleanup (idempotent) ───────────────────────────────────────────────
  // Stored in a ref so the native listeners can call it without depending
  // on a useCallback identity that might change between attach and detach.

  const cleanupRef = useRef<(() => void) | null>(null);

  /** End the drag session.  Safe to call multiple times. */
  const endSession = useCallback((reason: string) => {
    if (activePointerIdRef.current === NO_POINTER) return; // already ended
    dbg('end-session', reason, 'pointer', activePointerIdRef.current);

    activePointerIdRef.current = NO_POINTER;
    itemIdRef.current = null;
    nearRef.current = false;
    hideGhost();
    setDrag(null);

    // Detach global listeners.
    cleanupRef.current?.();
    cleanupRef.current = null;
  }, [hideGhost]);

  // ── Start ──────────────────────────────────────────────────────────────

  const onDragStart = useCallback((e: React.PointerEvent, itemId: string, emoji: string) => {
    // If a drag is already active (shouldn't happen, but defensive), end it.
    if (activePointerIdRef.current !== NO_POINTER) {
      endSession('new-drag-while-active');
    }

    e.preventDefault();
    e.stopPropagation();

    const pid = e.pointerId;
    const x = e.clientX;
    const y = e.clientY;
    const session = ++sessionRef.current;

    activePointerIdRef.current = pid;
    itemIdRef.current = itemId;
    nearRef.current = false;

    dbg('start', { itemId, pid, x, y, session });

    // Mount ghost via React state.
    setDrag({ itemId, emoji, startX: x, startY: y });

    // ── Global listeners (native) ────────────────────────────────────

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pid || session !== sessionRef.current) {
        dbg('move-ignored', { evPid: ev.pointerId, pid, evSession: session, current: sessionRef.current });
        return;
      }
      moveGhost(ev.clientX, ev.clientY);

      // Near-mouth scale class.
      const ghost = ghostRef.current;
      if (ghost?.firstElementChild) {
        const near = isNearMouth(ev.clientX, ev.clientY);
        ghost.firstElementChild.classList.toggle('scale-75', near);
        if (near !== nearRef.current) {
          nearRef.current = near;
          onNearMouthChangeRef.current?.(near);
        }
      }
    };

    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== pid || session !== sessionRef.current) return;

      const feedItemId = itemIdRef.current;
      const didFeed = feedItemId ? isNearMouth(ev.clientX, ev.clientY) : false;
      const wasMouthOpen = nearRef.current;

      dbg('pointerup', { pid, x: ev.clientX, y: ev.clientY, didFeed, feedItemId });

      endSession(didFeed ? 'feed' : 'miss');

      if (didFeed && feedItemId) {
        onFeedRef.current(feedItemId);
      } else if (wasMouthOpen) {
        onNearMouthChangeRef.current?.(false);
      }
    };

    const onCancel = (ev: PointerEvent) => {
      if (ev.pointerId !== pid || session !== sessionRef.current) return;
      const wasMouthOpen = nearRef.current;
      dbg('pointercancel', { pid });
      endSession('cancel');
      if (wasMouthOpen) onNearMouthChangeRef.current?.(false);
    };

    const onBlur = () => {
      if (session !== sessionRef.current) return;
      const wasMouthOpen = nearRef.current;
      dbg('blur');
      endSession('blur');
      if (wasMouthOpen) onNearMouthChangeRef.current?.(false);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('blur', onBlur);
    dbg('listeners-attached', { session });

    cleanupRef.current = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('blur', onBlur);
      dbg('listeners-detached', { session });
    };
  }, [endSession, moveGhost]);

  // Cleanup on unmount.
  useEffect(() => () => {
    endSession('unmount');
  }, [endSession]);

  return { drag, ghostRef, onDragStart };
}

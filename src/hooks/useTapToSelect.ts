import { useCallback, useRef } from 'react';
import type { PointerEvent } from 'react';

/** How far a touch may move and still count as a tap rather than a scroll. */
const TAP_SLOP_PX = 10;

/**
 * After a tap selects an item, the browser still fires the compatibility
 * mousedown/mouseup/click for that touch, and the dropdown is gone by then, so
 * they land on whatever was underneath: usually the textarea, where they'd
 * move the caret away from the inserted text. Swallow them once.
 */
function suppressGhostClick(): void {
  const types = ['mousedown', 'mouseup', 'click'] as const;
  const swallow = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.type === 'click') cleanup();
  };
  const cleanup = () => {
    clearTimeout(timer);
    for (const type of types) document.removeEventListener(type, swallow, true);
  };
  for (const type of types) document.addEventListener(type, swallow, true);
  // Compatibility events follow within a few hundred ms; don't linger.
  const timer = setTimeout(cleanup, 600);
}

/**
 * Pointer handlers for items in a composer autocomplete list.
 *
 * - Mouse: select on pointer-down and preventDefault so the composer keeps
 *   focus (a mousedown-preventDefault can otherwise swallow the click).
 * - Touch/pen: defer to pointer-up and require the finger to have stayed put,
 *   so dragging to scroll the list isn't mistaken for a tap. Touch pointer-down
 *   must NOT preventDefault, or native scrolling is killed.
 *
 * Returns a function that builds the handlers for one item.
 */
export function useTapToSelect() {
  // Where the current touch/pen gesture started. One gesture at a time.
  const start = useRef<{ x: number; y: number } | null>(null);

  return useCallback((onSelect: () => void) => ({
    onPointerDown: (e: PointerEvent) => {
      if (e.pointerType === 'mouse') {
        e.preventDefault();
        onSelect();
        return;
      }
      start.current = { x: e.clientX, y: e.clientY };
    },
    onPointerUp: (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return;
      const origin = start.current;
      start.current = null;
      if (!origin) return;
      if (Math.abs(e.clientX - origin.x) < TAP_SLOP_PX && Math.abs(e.clientY - origin.y) < TAP_SLOP_PX) {
        suppressGhostClick();
        onSelect();
      }
    },
    onPointerCancel: () => {
      start.current = null;
    },
  }), []);
}

import { useCallback, useEffect, useMemo, useRef } from 'react';

/** Touch has to hold still this long before a drag lifts, so a swipe still scrolls the picker. */
const TOUCH_HOLD_MS = 250;
/** Mouse/pen movement before a press becomes a drag rather than a click. */
const MOVE_SLOP = 6;
const GHOST_SIZE = 64;

/** What follows the pointer while dragging: an image URL or an emoji. */
export interface DragGhost {
  url?: string;
  emoji?: string;
}

export interface DragOut<T> {
  /** Call from an item's onPointerDown. */
  start: (e: React.PointerEvent, item: T, ghost: DragGhost) => void;
  /** True right after a drop, so the item's onClick can skip the click that follows. */
  justDropped: () => boolean;
}

function makeGhost({ url, emoji }: DragGhost): HTMLElement {
  const el = document.createElement('div');
  el.setAttribute('aria-hidden', 'true');
  Object.assign(el.style, {
    position: 'fixed',
    left: '0',
    top: '0',
    zIndex: '100',
    width: `${GHOST_SIZE}px`,
    height: `${GHOST_SIZE}px`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: `${GHOST_SIZE * 0.82}px`,
    lineHeight: '1',
    pointerEvents: 'none',
    userSelect: 'none',
    filter: 'drop-shadow(0 6px 10px rgba(0,0,0,0.25))',
    willChange: 'transform',
  });
  if (url) {
    const img = document.createElement('img');
    img.src = url;
    img.draggable = false;
    Object.assign(img.style, { width: '100%', height: '100%', objectFit: 'contain' });
    el.append(img);
  } else {
    el.textContent = emoji ?? '';
  }
  document.body.append(el);
  return el;
}

/**
 * Drag items out of a picker and drop them somewhere else on the page.
 * Mouse and pen drag after a few pixels of movement; touch lifts after a
 * short hold. The ghost is moved directly on the DOM so the picker doesn't
 * re-render while dragging.
 */
export function useDragOut<T>(onDrop: ((item: T, x: number, y: number) => void) | undefined): DragOut<T> {
  const onDropRef = useRef(onDrop);
  useEffect(() => { onDropRef.current = onDrop; }, [onDrop]);

  const cleanupRef = useRef<(() => void) | null>(null);
  const droppedAt = useRef(0);
  useEffect(() => () => cleanupRef.current?.(), []);

  const start = useCallback((e: React.PointerEvent, item: T, ghost: DragGhost) => {
    if (!onDropRef.current || e.button !== 0) return;
    cleanupRef.current?.();

    const id = e.pointerId;
    const touch = e.pointerType === 'touch';
    const sx = e.clientX;
    const sy = e.clientY;
    let el: HTMLElement | null = null;
    let timer: number | undefined;

    // Stops text selection and native image drag; touch keeps its default so it can scroll.
    if (!touch) e.preventDefault();

    const place = (x: number, y: number) => {
      if (el) el.style.transform = `translate(${x - GHOST_SIZE / 2}px, ${y - GHOST_SIZE / 2}px) scale(1.15)`;
    };
    const lift = (x: number, y: number) => {
      el = makeGhost(ghost);
      place(x, y);
      try { navigator.vibrate?.(15); } catch { /* unsupported */ }
    };

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      if (!el) {
        const far = Math.hypot(ev.clientX - sx, ev.clientY - sy) > MOVE_SLOP;
        if (touch) {
          // Moved before the hold finished: it's a scroll, not a drag
          if (far) cleanup();
          return;
        }
        if (!far) return;
        lift(ev.clientX, ev.clientY);
      }
      place(ev.clientX, ev.clientY);
    };
    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      if (el) {
        droppedAt.current = performance.now();
        onDropRef.current?.(item, ev.clientX, ev.clientY);
      }
      cleanup();
    };
    const onCancel = (ev: PointerEvent) => {
      if (ev.pointerId === id) cleanup();
    };
    // Once lifted, a touch drag must not scroll the page
    const onTouchMove = (ev: TouchEvent) => {
      if (el && ev.cancelable) ev.preventDefault();
    };
    // Long-press would otherwise open the image/context menu
    const onContextMenu = (ev: Event) => {
      if (touch || el) ev.preventDefault();
    };

    function cleanup() {
      window.clearTimeout(timer);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('contextmenu', onContextMenu);
      el?.remove();
      el = null;
      cleanupRef.current = null;
    }

    if (touch) timer = window.setTimeout(() => lift(sx, sy), TOUCH_HOLD_MS);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('contextmenu', onContextMenu);
    cleanupRef.current = cleanup;
  }, []);

  // The click that follows a drop lands within a few ms; anything later is a real tap
  const justDropped = useCallback(() => performance.now() - droppedAt.current < 300, []);

  return useMemo(() => ({ start, justDropped }), [start, justDropped]);
}

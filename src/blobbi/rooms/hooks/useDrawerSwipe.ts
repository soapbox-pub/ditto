/**
 * Drag the room drawer up to close it: follows the finger, then closes past
 * a distance or on a quick flick.
 */

import { useCallback, useRef, useState } from 'react';

/** Upward drag (px) that closes the drawer. */
const CLOSE_DISTANCE = 56;
/** Upward flick speed (px/ms) that closes it regardless of distance. */
const CLOSE_VELOCITY = 0.5;

export function useDrawerSwipe(open: boolean, onClose: () => void) {
  const [offset, setOffset] = useState(0);
  const start = useRef<{ id: number; y: number; t: number } | null>(null);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (!open || !e.isPrimary) return;
    start.current = { id: e.pointerId, y: e.clientY, t: performance.now() };
  }, [open]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const s = start.current;
    if (!s || s.id !== e.pointerId) return;
    // A mouse released outside before capture never sent its pointerup here
    if (e.pointerType === 'mouse' && e.buttons === 0) {
      start.current = null;
      setOffset(0);
      return;
    }
    const dy = Math.min(0, e.clientY - s.y);
    if (dy < -6 && !(e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
    setOffset(dy);
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    const s = start.current;
    // Another finger lifting doesn't end this swipe
    if (!s || s.id !== e.pointerId) return;
    start.current = null;
    const dy = e.clientY - s.y;
    const speed = -dy / Math.max(1, performance.now() - s.t);
    setOffset(0);
    if (dy < -CLOSE_DISTANCE || (dy < -12 && speed > CLOSE_VELOCITY)) onClose();
  }, [onClose]);

  const onPointerCancel = useCallback(() => {
    start.current = null;
    setOffset(0);
  }, []);

  return { offset, handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel } };
}


/**
 * useFurnitureDrag — Long-press-to-drag state machine for furniture items.
 *
 * Uses a pointer-events-only approach with refs for hot-path tracking and
 * global pointer event listeners for reliable cross-platform behavior.
 *
 * Interaction model:
 * 1. Quick tap on a selected item → nothing (click handler selects/reselects).
 * 2. Pointer down on a selected item starts a 500ms hold timer.
 * 3. If the user moves > 8px during hold → cancel hold (no drag).
 * 4. After 500ms without excessive movement → drag mode activates.
 * 5. Pointer move while dragging → calls onMove with normalized coords.
 * 6. Pointer up / cancel → ends drag or cancels hold.
 * 7. Click is suppressed after a completed hold/drag cycle.
 *
 * All tracking uses refs to avoid stale closure issues. Only the visual
 * state flags (isDragging, isHolding) use React state for re-render.
 */

import { useState, useCallback, useEffect, useRef } from 'react';

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** Hold duration in ms before drag activates. */
const HOLD_DURATION_MS = 500;

/** Max pointer movement in px during hold before canceling. */
const MOVE_CANCEL_PX = 8;

interface UseFurnitureDragOptions {
  /** Ref to the room shell container for measuring bounds. */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** Called on every pointer move with updated normalized coords. */
  onMove: (x: number, y: number) => void;
}

interface DragSession {
  pointerId: number;
  startX: number;
  startY: number;
  offsetDx: number;
  offsetDy: number;
}

export function useFurnitureDrag({ containerRef, onMove }: UseFurnitureDragOptions) {
  const [isDragging, setIsDragging] = useState(false);
  const [isHolding, setIsHolding] = useState(false);

  // Refs for hot-path state (no stale closures)
  const sessionRef = useRef<DragSession | null>(null);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDraggingRef = useRef(false);
  const isHoldingRef = useRef(false);
  const suppressClickRef = useRef(false);
  const onMoveRef = useRef(onMove);

  // Keep callback refs current
  onMoveRef.current = onMove;

  // ─── Cleanup helper ───
  const cleanup = useCallback(() => {
    if (holdTimerRef.current !== null) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    sessionRef.current = null;
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      setIsDragging(false);
    }
    if (isHoldingRef.current) {
      isHoldingRef.current = false;
      setIsHolding(false);
    }
  }, []);

  // ─── Global pointer event handlers (attached/detached per session) ───
  const handlePointerMove = useCallback((e: PointerEvent) => {
    const session = sessionRef.current;
    if (!session || e.pointerId !== session.pointerId) return;

    const dx = e.clientX - session.startX;
    const dy = e.clientY - session.startY;

    if (isHoldingRef.current) {
      // During hold — cancel if moved too far
      if (Math.sqrt(dx * dx + dy * dy) > MOVE_CANCEL_PX) {
        cleanup();
      }
      return;
    }

    if (isDraggingRef.current) {
      // During drag — compute normalized position
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const normX = (e.clientX - rect.left) / rect.width;
      const normY = (e.clientY - rect.top) / rect.height;
      onMoveRef.current(
        clamp(normX + session.offsetDx, 0, 1),
        clamp(normY + session.offsetDy, 0, 1),
      );
    }
  }, [containerRef, cleanup]);

  const handlePointerUp = useCallback((e: PointerEvent) => {
    const session = sessionRef.current;
    if (!session || e.pointerId !== session.pointerId) return;

    if (isDraggingRef.current || isHoldingRef.current) {
      suppressClickRef.current = true;
      // Clear suppress after a tick so subsequent real clicks work
      setTimeout(() => { suppressClickRef.current = false; }, 0);
    }
    cleanup();
  }, [cleanup]);

  const handlePointerCancel = useCallback((e: PointerEvent) => {
    const session = sessionRef.current;
    if (!session || e.pointerId !== session.pointerId) return;
    cleanup();
  }, [cleanup]);

  // Attach/detach global listeners based on active session
  const attachListeners = useCallback(() => {
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerCancel);
  }, [handlePointerMove, handlePointerUp, handlePointerCancel]);

  const detachListeners = useCallback(() => {
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', handlePointerUp);
    window.removeEventListener('pointercancel', handlePointerCancel);
  }, [handlePointerMove, handlePointerUp, handlePointerCancel]);

  // Detach on cleanup/unmount
  useEffect(() => {
    return () => {
      detachListeners();
      if (holdTimerRef.current !== null) {
        clearTimeout(holdTimerRef.current);
      }
    };
  }, [detachListeners]);

  // Sync listeners with session lifecycle
  useEffect(() => {
    if (isDragging || isHolding) {
      attachListeners();
      return () => detachListeners();
    }
  }, [isDragging, isHolding, attachListeners, detachListeners]);

  // ─── Start hold (called from pointerDown on selected item) ───
  const startHold = useCallback((e: React.PointerEvent, currentX: number, currentY: number) => {
    e.preventDefault();
    e.stopPropagation();

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const pointerNormX = (e.clientX - rect.left) / rect.width;
    const pointerNormY = (e.clientY - rect.top) / rect.height;

    const session: DragSession = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      offsetDx: currentX - pointerNormX,
      offsetDy: currentY - pointerNormY,
    };

    sessionRef.current = session;
    isHoldingRef.current = true;
    setIsHolding(true);

    holdTimerRef.current = setTimeout(() => {
      holdTimerRef.current = null;
      // Transition from holding → dragging
      isHoldingRef.current = false;
      setIsHolding(false);
      isDraggingRef.current = true;
      setIsDragging(true);
    }, HOLD_DURATION_MS);
  }, [containerRef]);

  // ─── Click suppression (for component to check) ───
  const shouldSuppressClick = useCallback(() => {
    return suppressClickRef.current;
  }, []);

  return { isDragging, isHolding, startHold, shouldSuppressClick };
}

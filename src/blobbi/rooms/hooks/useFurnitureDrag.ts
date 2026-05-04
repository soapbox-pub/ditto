/**
 * useFurnitureDrag — Pointer-tracking hook for moving furniture items.
 *
 * Normalizes pointer coordinates to [0, 1] relative to the room container.
 * Works with both mouse (desktop) and touch (mobile).
 * Touch handlers call stopPropagation to prevent room swipe navigation.
 *
 * Usage: attach the returned handlers to the draggable furniture <img> element.
 * The hook reports the new normalized (x, y) on every move and on release.
 */

import { useState, useCallback, useEffect, useRef } from 'react';

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

interface UseFurnitureDragOptions {
  /** Ref to the room shell container for measuring bounds. */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** Called on every pointer move with updated normalized coords. */
  onMove: (x: number, y: number) => void;
  /** Called when drag finishes. */
  onEnd?: () => void;
}

export function useFurnitureDrag({ containerRef, onMove, onEnd }: UseFurnitureDragOptions) {
  const [isDragging, setIsDragging] = useState(false);
  const startOffsetRef = useRef({ dx: 0, dy: 0 });

  const normalize = useCallback((clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0.5, y: 0.75 };
    return {
      x: clamp((clientX - rect.left) / rect.width, 0, 1),
      y: clamp((clientY - rect.top) / rect.height, 0, 1),
    };
  }, [containerRef]);

  const startDrag = useCallback((clientX: number, clientY: number, currentX: number, currentY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    // Compute offset between pointer and item's current normalized position
    const pointerNormX = (clientX - rect.left) / rect.width;
    const pointerNormY = (clientY - rect.top) / rect.height;
    startOffsetRef.current = {
      dx: currentX - pointerNormX,
      dy: currentY - pointerNormY,
    };
    setIsDragging(true);
  }, [containerRef]);

  const moveDrag = useCallback((clientX: number, clientY: number) => {
    if (!isDragging) return;
    const { x, y } = normalize(clientX, clientY);
    onMove(
      clamp(x + startOffsetRef.current.dx, 0, 1),
      clamp(y + startOffsetRef.current.dy, 0, 1),
    );
  }, [isDragging, normalize, onMove]);

  const endDrag = useCallback(() => {
    if (!isDragging) return;
    setIsDragging(false);
    onEnd?.();
  }, [isDragging, onEnd]);

  // Global mouse listeners while dragging
  useEffect(() => {
    if (!isDragging) return;
    const onMouseMove = (e: MouseEvent) => moveDrag(e.clientX, e.clientY);
    const onMouseUp = () => endDrag();
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [isDragging, moveDrag, endDrag]);

  // Item-level pointer handlers
  const onPointerDown = useCallback((e: React.PointerEvent, currentX: number, currentY: number) => {
    e.preventDefault();
    e.stopPropagation();
    startDrag(e.clientX, e.clientY, currentX, currentY);
  }, [startDrag]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    e.stopPropagation();
    if (e.touches.length > 0) {
      moveDrag(e.touches[0].clientX, e.touches[0].clientY);
    }
  }, [moveDrag]);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    e.stopPropagation();
    endDrag();
  }, [endDrag]);

  return { isDragging, onPointerDown, onTouchMove, onTouchEnd };
}

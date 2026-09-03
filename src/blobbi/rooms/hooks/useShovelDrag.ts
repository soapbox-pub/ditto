/**
 * useShovelDrag — Drag-to-clean state machine for the shovel interaction.
 *
 * Encapsulates pointer tracking, poop hit-testing, and cleanup dispatch.
 * Works with both mouse (desktop) and touch (mobile).
 * Used only in the kitchen where the shovel lives.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import type { PoopState } from '../components/BlobbiRoomShell';
import { hasAnyPoop } from '../lib/poop-system';

export function useShovelDrag(poopState: PoopState | null) {
  const anyPoop = poopState ? hasAnyPoop(poopState.poops) : false;

  const [isDragging, setIsDragging] = useState(false);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const shovelRef = useRef<HTMLButtonElement>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);

  const poopRefs = useRef<Map<string, HTMLElement>>(new Map());
  const [hoveredPoopId, setHoveredPoopId] = useState<string | null>(null);

  const startDrag = useCallback((clientX: number, clientY: number) => {
    if (!anyPoop || !shovelRef.current) return;
    const rect = shovelRef.current.getBoundingClientRect();
    dragOffsetRef.current = {
      x: clientX - (rect.left + rect.width / 2),
      y: clientY - (rect.top + rect.height / 2),
    };
    setDragPos({
      x: clientX - dragOffsetRef.current.x,
      y: clientY - dragOffsetRef.current.y,
    });
    setIsDragging(true);
  }, [anyPoop]);

  const moveDrag = useCallback((clientX: number, clientY: number) => {
    if (!isDragging) return;
    setDragPos({
      x: clientX - dragOffsetRef.current.x,
      y: clientY - dragOffsetRef.current.y,
    });

    let found: string | null = null;
    poopRefs.current.forEach((el, id) => {
      const r = el.getBoundingClientRect();
      if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) {
        found = id;
      }
    });
    setHoveredPoopId(found);
  }, [isDragging]);

  /** Abort the drag without cleaning (e.g. browser-cancelled touch). */
  const cancelDrag = useCallback(() => {
    setIsDragging(false);
    setDragPos(null);
    setHoveredPoopId(null);
  }, []);

  const endDrag = useCallback(() => {
    if (!isDragging) return;
    if (hoveredPoopId && poopState) {
      poopState.onRemovePoop(hoveredPoopId);
    }
    cancelDrag();
  }, [isDragging, hoveredPoopId, poopState, cancelDrag]);

  // Mouse: global listeners while dragging
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    startDrag(e.clientX, e.clientY);
  }, [startDrag]);

  // Global listeners own the drag once started. They must live on `window`
  // (not as React props on the shovel button): the button sits in the shell's
  // `children`, which React bails out of re-rendering when drag state changes
  // in the shell, so button-bound move/end handlers would keep stale closures
  // where `isDragging` is still false and the drag would never track or finish.
  useEffect(() => {
    if (!isDragging) return;
    const onMouseMove = (e: MouseEvent) => moveDrag(e.clientX, e.clientY);
    const onMouseUp = () => endDrag();
    const onTouchMove = (e: TouchEvent) => moveDrag(e.touches[0].clientX, e.touches[0].clientY);
    const onTouchEnd = () => endDrag();
    const onTouchCancel = () => cancelDrag();
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('touchmove', onTouchMove);
    window.addEventListener('touchend', onTouchEnd);
    window.addEventListener('touchcancel', onTouchCancel);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchCancel);
    };
  }, [isDragging, moveDrag, endDrag, cancelDrag]);

  // Touch: stopPropagation prevents BlobbiRoomShell swipe navigation
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    e.stopPropagation();
    startDrag(e.touches[0].clientX, e.touches[0].clientY);
  }, [startDrag]);

  return {
    anyPoop,
    isDragging,
    dragPos,
    hoveredPoopId,
    shovelRef,
    poopRefs,
    onMouseDown,
    onTouchStart,
  };
}

export type ShovelDrag = ReturnType<typeof useShovelDrag>;

/**
 * useRoomDrag — drag something from the dock or the drawer into the room:
 * an item, a visiting Blobbi, or the shovel.
 *
 * A press on a draggable starts a session; window listeners own it from
 * there, so the source can unmount mid-drag (the drawer closes to show the
 * room). Moving past a few pixels shows a ghost under the finger and
 * reports hovering; letting go calls `onDrop` with the screen point. A press
 * that never moves is a tap (`onTap`).
 *
 * The ghost is positioned by direct DOM writes; React state changes only on
 * start and end, so the page doesn't re-render while dragging.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

/** Movement (px) before a press becomes a drag. */
const DRAG_SLOP = 8;

type RoomDragPayload =
  | { kind: 'item'; itemId: string; emoji: string }
  | { kind: 'guest'; d: string }
  | { kind: 'shovel' };

interface RoomDragState {
  payload: RoomDragPayload;
  startX: number;
  startY: number;
}

interface UseRoomDragOptions {
  onDrop: (payload: RoomDragPayload, clientX: number, clientY: number) => void;
  onTap?: (payload: RoomDragPayload) => void;
  /** The drag became visible (passed the slop). */
  onLift?: (payload: RoomDragPayload) => void;
  /** Pointer moved while dragging; `null` when the drag ends. */
  onHover?: (payload: RoomDragPayload, point: { x: number; y: number } | null) => void;
}

export function useRoomDrag(options: UseRoomDragOptions) {
  const [drag, setDrag] = useState<RoomDragState | null>(null);
  const ghostRef = useRef<HTMLDivElement | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const cleanupRef = useRef<(() => void) | null>(null);

  const end = useCallback(() => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    setDrag(null);
  }, []);

  const start = useCallback((e: React.PointerEvent, payload: RoomDragPayload) => {
    if (!e.isPrimary || e.button > 0) return;
    end();
    e.stopPropagation();
    const pid = e.pointerId;
    const startX = e.clientX;
    const startY = e.clientY;
    let lifted = false;
    setDrag({ payload, startX, startY });

    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== pid) return;
      if (!lifted) {
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < DRAG_SLOP) return;
        lifted = true;
        optionsRef.current.onLift?.(payload);
      }
      const ghost = ghostRef.current;
      if (ghost) {
        ghost.style.display = '';
        ghost.style.left = `${ev.clientX}px`;
        ghost.style.top = `${ev.clientY}px`;
      }
      optionsRef.current.onHover?.(payload, { x: ev.clientX, y: ev.clientY });
    };
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== pid) return;
      const wasLifted = lifted;
      end();
      if (wasLifted) {
        // A drag let go over its own button isn't also a click on it
        const swallow = (c: MouseEvent) => {
          c.stopPropagation();
          c.preventDefault();
        };
        window.addEventListener('click', swallow, { capture: true, once: true });
        setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);
        optionsRef.current.onHover?.(payload, null);
        optionsRef.current.onDrop(payload, ev.clientX, ev.clientY);
      } else {
        optionsRef.current.onTap?.(payload);
      }
    };
    const cancel = (ev: PointerEvent | Event) => {
      if ('pointerId' in ev && ev.pointerId !== pid) return;
      const wasLifted = lifted;
      end();
      if (wasLifted) optionsRef.current.onHover?.(payload, null);
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('blur', cancel);
    cleanupRef.current = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('blur', cancel);
    };
  }, [end]);

  useEffect(() => end, [end]);

  return { drag, ghostRef, start };
}

export type RoomDrag = ReturnType<typeof useRoomDrag>;

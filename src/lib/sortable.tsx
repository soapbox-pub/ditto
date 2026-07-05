/* eslint-disable react-refresh/only-export-components -- dnd-kit-compatible API: components and utilities ship together by design */
/**
 * Hand-rolled drag-to-reorder for vertical and horizontal lists, replacing
 * the @dnd-kit/core + @dnd-kit/sortable + @dnd-kit/utilities packages
 * (~97 KB of the eager bundle) with pointer events.
 *
 * Exports the exact subset of dnd-kit's API that Ditto used, so call sites
 * only change their import path:
 *
 * ```tsx
 * <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
 *   <SortableContext items={ids} strategy={verticalListSortingStrategy}>
 *     {items.map(...)} // each calls useSortable({ id })
 *   </SortableContext>
 * </DndContext>
 * ```
 *
 * Behavior notes:
 * - The active item follows the pointer along the list axis only.
 * - Non-active items shift out of the way with a CSS transition, displaced
 *   by the active item's size plus the list gap (uniform-list assumption,
 *   which holds for every sortable list in Ditto).
 * - Keyboard support: arrow keys on the drag handle move the item one
 *   position per press (fires `onDragEnd` directly).
 * - Touch: scrolling is suppressed while a drag is in progress.
 */

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { CSSProperties, HTMLAttributes, PointerEvent as ReactPointerEvent, ReactNode } from 'react';

// ── Public types (dnd-kit-compatible) ─────────────────────────────────────────

export interface Transform {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
}

export interface DragEndEvent {
  active: { id: string };
  over: { id: string } | null;
}

export type SortingStrategy = 'vertical' | 'horizontal';

export const verticalListSortingStrategy: SortingStrategy = 'vertical';
export const horizontalListSortingStrategy: SortingStrategy = 'horizontal';

/** Collision detection is always nearest-center along the axis; token kept for API compatibility. */
export const closestCenter = 'closestCenter' as const;

/** Keyboard coordinates are handled internally; token kept for API compatibility. */
export const sortableKeyboardCoordinates = undefined;

export const CSS = {
  Transform: {
    toString(transform: Transform | null | undefined): string | undefined {
      if (!transform) return undefined;
      return `translate3d(${transform.x}px, ${transform.y}px, 0)`;
    },
  },
};

export function arrayMove<T>(array: T[], from: number, to: number): T[] {
  const next = array.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

// ── Sensors ───────────────────────────────────────────────────────────────────

export interface SensorOptions {
  activationConstraint?: { distance?: number };
  coordinateGetter?: unknown;
}

export interface SensorDescriptor {
  kind: 'pointer' | 'keyboard';
  options?: SensorOptions;
}

export const PointerSensor = 'pointer' as const;
export const KeyboardSensor = 'keyboard' as const;

export function useSensor(kind: typeof PointerSensor | typeof KeyboardSensor, options?: SensorOptions): SensorDescriptor {
  return useMemo(() => ({ kind, options }), [kind, options]);
}

export function useSensors(...sensors: SensorDescriptor[]): SensorDescriptor[] {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => sensors, sensors);
}

// ── Internal engine ───────────────────────────────────────────────────────────

interface Engine {
  nodes: Map<string, HTMLElement>;
  items: string[];
  axis: 'x' | 'y';
  activationDistance: number;
  onDragEnd?: (event: DragEndEvent) => void;
  /** Currently dragged item, or null when idle. */
  activeId: string | null;
  /** Item whose slot the active item currently occupies. */
  overId: string | null;
  /** Pointer delta along the axis since drag start. */
  delta: number;
  /** Item rects along the axis, captured at drag start: [start, size]. */
  rects: Map<string, { start: number; size: number; center: number }>;
  /** Displacement applied to non-active items (active size + gap). */
  shift: number;
  /** Bump the version state so subscribed items re-render. */
  notify: () => void;
}

interface DndContextValue {
  engine: Engine;
  version: number;
}

const DndReactContext = createContext<DndContextValue | null>(null);

// ── DndContext ────────────────────────────────────────────────────────────────

export interface DndContextProps {
  sensors?: SensorDescriptor[];
  /** Ignored — nearest-center along the axis is always used. */
  collisionDetection?: unknown;
  onDragEnd?: (event: DragEndEvent) => void;
  children: ReactNode;
}

export function DndContext({ sensors, onDragEnd, children }: DndContextProps) {
  const [version, setVersion] = useState(0);

  const engineRef = useRef<Engine>(undefined);
  if (!engineRef.current) {
    engineRef.current = {
      nodes: new Map(),
      items: [],
      axis: 'y',
      activationDistance: 0,
      onDragEnd: undefined,
      activeId: null,
      overId: null,
      delta: 0,
      rects: new Map(),
      shift: 0,
      notify: () => setVersion((v) => v + 1),
    };
  }

  const engine = engineRef.current;
  engine.onDragEnd = onDragEnd;
  engine.activationDistance = sensors
    ?.find((s) => s.kind === 'pointer')?.options?.activationConstraint?.distance ?? 0;

  const value = useMemo(() => ({ engine, version }), [engine, version]);

  return <DndReactContext.Provider value={value}>{children}</DndReactContext.Provider>;
}

// ── SortableContext ───────────────────────────────────────────────────────────

export interface SortableContextProps {
  items: string[];
  strategy?: SortingStrategy;
  children: ReactNode;
}

export function SortableContext({ items, strategy, children }: SortableContextProps) {
  const ctx = useContext(DndReactContext);
  if (ctx) {
    ctx.engine.items = items;
    ctx.engine.axis = strategy === horizontalListSortingStrategy ? 'x' : 'y';
  }
  return <>{children}</>;
}

// ── useSortable ───────────────────────────────────────────────────────────────

export interface UseSortableArguments {
  id: string;
  disabled?: boolean;
}

export interface UseSortableReturn {
  attributes: HTMLAttributes<HTMLElement>;
  listeners: {
    onPointerDown: (event: ReactPointerEvent) => void;
    onKeyDown: (event: React.KeyboardEvent) => void;
    style?: CSSProperties;
  };
  setNodeRef: (node: HTMLElement | null) => void;
  transform: Transform | null;
  transition: string | undefined;
  isDragging: boolean;
}

/** Suppress the click that fires after a completed drag on the same element. */
function suppressNextClick(): void {
  const suppress = (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
  };
  window.addEventListener('click', suppress, { capture: true, once: true });
  // The post-drag click fires in the same task as pointerup (if at all).
  // Remove the trap shortly after so it can never swallow an unrelated
  // later click when the browser skips the compatibility click event.
  setTimeout(() => {
    window.removeEventListener('click', suppress, { capture: true });
  }, 0);
}

export function useSortable({ id, disabled }: UseSortableArguments): UseSortableReturn {
  const ctx = useContext(DndReactContext);
  const idRef = useRef(id);
  idRef.current = id;

  const setNodeRef = useCallback((node: HTMLElement | null) => {
    if (!ctx) return;
    if (node) {
      ctx.engine.nodes.set(idRef.current, node);
    } else {
      ctx.engine.nodes.delete(idRef.current);
    }
  }, [ctx]);

  const onPointerDown = useCallback((event: ReactPointerEvent) => {
    if (!ctx || disabled) return;
    if (event.button !== 0) return;

    const { engine } = ctx;
    const axis = engine.axis;
    const startCoord = axis === 'y' ? event.clientY : event.clientX;
    const activeId = idRef.current;
    let dragging = false;

    // Block scrolling for the whole touch sequence. `pointerdown` fires
    // before the compatibility `touchstart`, so cancelling touchstart stops
    // the browser from ever starting gesture arbitration — critical inside
    // nested scroll containers (e.g. the mobile drawer's overflow-y-auto
    // nav), where the scroller can win the gesture race and fire
    // pointercancel before the drag activates. Cancelling touchmove stays as
    // a fallback for browsers that order the events differently. Pointer
    // events are unaffected by either preventDefault. The listeners only
    // live between pointerdown on a drag handle and release, so scrolling
    // elsewhere is unaffected.
    const preventTouchDefault = (e: TouchEvent) => {
      if (e.cancelable) e.preventDefault();
    };

    const start = () => {
      dragging = true;
      engine.rects.clear();
      for (const itemId of engine.items) {
        const node = engine.nodes.get(itemId);
        if (!node) continue;
        const rect = node.getBoundingClientRect();
        const startPos = axis === 'y' ? rect.top : rect.left;
        const size = axis === 'y' ? rect.height : rect.width;
        engine.rects.set(itemId, { start: startPos, size, center: startPos + size / 2 });
      }

      // Displacement = active size + gap between adjacent items (uniform lists).
      const active = engine.rects.get(activeId);
      let gap = 0;
      const index = engine.items.indexOf(activeId);
      const neighbor = engine.rects.get(engine.items[index + 1] ?? engine.items[index - 1] ?? '');
      if (active && neighbor) {
        gap = Math.abs(
          neighbor.start > active.start
            ? neighbor.start - (active.start + active.size)
            : active.start - (neighbor.start + neighbor.size),
        );
      }
      engine.shift = (active?.size ?? 0) + gap;

      engine.activeId = activeId;
      engine.overId = activeId;
      engine.delta = 0;
      document.body.style.userSelect = 'none';
      engine.notify();
    };

    const onMove = (e: globalThis.PointerEvent) => {
      const coord = axis === 'y' ? e.clientY : e.clientX;
      const delta = coord - startCoord;

      if (!dragging) {
        if (Math.abs(delta) < Math.max(engine.activationDistance, 1)) return;
        start();
      }

      engine.delta = delta;

      // Nearest original slot center to the active item's current center.
      const active = engine.rects.get(activeId);
      if (active) {
        const current = active.center + delta;
        let best: string | null = null;
        let bestDist = Infinity;
        for (const [itemId, rect] of engine.rects) {
          const dist = Math.abs(rect.center - current);
          if (dist < bestDist) {
            bestDist = dist;
            best = itemId;
          }
        }
        engine.overId = best;
      }

      engine.notify();
    };

    const cleanup = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('touchstart', preventTouchDefault);
      window.removeEventListener('touchmove', preventTouchDefault);
      document.body.style.userSelect = '';
    };

    const finish = () => {
      const { overId } = engine;
      engine.activeId = null;
      engine.overId = null;
      engine.delta = 0;
      engine.notify();
      if (overId && overId !== activeId) {
        engine.onDragEnd?.({ active: { id: activeId }, over: { id: overId } });
      }
    };

    const onUp = () => {
      cleanup();
      if (dragging) {
        suppressNextClick();
        finish();
      }
    };

    const onCancel = () => {
      cleanup();
      if (dragging) {
        engine.activeId = null;
        engine.overId = null;
        engine.delta = 0;
        engine.notify();
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('touchstart', preventTouchDefault, { passive: false });
    window.addEventListener('touchmove', preventTouchDefault, { passive: false });
  }, [ctx, disabled]);

  const onKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (!ctx || disabled) return;
    const { engine } = ctx;
    const axis = engine.axis;
    const backward = axis === 'y' ? 'ArrowUp' : 'ArrowLeft';
    const forward = axis === 'y' ? 'ArrowDown' : 'ArrowRight';
    if (event.key !== backward && event.key !== forward) return;

    const index = engine.items.indexOf(idRef.current);
    const target = event.key === backward ? index - 1 : index + 1;
    if (index === -1 || target < 0 || target >= engine.items.length) return;

    event.preventDefault();
    event.stopPropagation();
    engine.onDragEnd?.({ active: { id: idRef.current }, over: { id: engine.items[target] } });
  }, [ctx, disabled]);

  // ── Derive per-item drag presentation from engine state ──

  let transform: Transform | null = null;
  let transition: string | undefined;
  let isDragging = false;

  if (ctx) {
    const { engine } = ctx;
    if (engine.activeId !== null) {
      const axis = engine.axis;
      if (engine.activeId === id) {
        isDragging = true;
        transform = {
          x: axis === 'x' ? engine.delta : 0,
          y: axis === 'y' ? engine.delta : 0,
          scaleX: 1,
          scaleY: 1,
        };
      } else {
        transition = 'transform 200ms ease';
        const items = engine.items;
        const activeIndex = items.indexOf(engine.activeId);
        const overIndex = items.indexOf(engine.overId ?? engine.activeId);
        const index = items.indexOf(id);
        let displacement = 0;
        if (activeIndex !== -1 && index !== -1) {
          if (activeIndex < overIndex && index > activeIndex && index <= overIndex) {
            displacement = -engine.shift;
          } else if (activeIndex > overIndex && index >= overIndex && index < activeIndex) {
            displacement = engine.shift;
          }
        }
        transform = {
          x: axis === 'x' ? displacement : 0,
          y: axis === 'y' ? displacement : 0,
          scaleX: 1,
          scaleY: 1,
        };
      }
    }
  }

  const attributes: HTMLAttributes<HTMLElement> = disabled ? {} : {
    'aria-roledescription': 'sortable',
  };

  return {
    attributes,
    listeners: {
      onPointerDown,
      onKeyDown,
      // Required for touch dragging: without it the browser starts scrolling
      // and cancels the pointer before the drag can begin.
      style: { touchAction: 'none' },
    },
    setNodeRef,
    transform,
    transition,
    isDragging,
  };
}

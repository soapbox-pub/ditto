import {
  useCallback, useLayoutEffect, useMemo, useRef, useState,
  type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';

import { ReorderContext, type ReorderContextValue } from '@/hooks/useReorderItem';
import { cn } from '@/lib/utils';

/** Movement past this from the press picks the row up. */
const PICKUP_PX = 5;
/** Edge band of the scroll container that auto-scrolls while dragging; speed ramps toward the edge. */
const EDGE_ZONE_PX = 48;
const EDGE_MAX_PX = 14;
const EDGE_MIN_PX = 2;
const SETTLE_MS = 200;
const SETTLE_EASING = 'cubic-bezier(0.2, 0, 0, 1)';

interface Slot {
  id: string;
  /** In the list's content coordinates, so they survive any scroll during the drag. */
  top: number;
  height: number;
}

export interface ReorderListProps {
  /** Row ids in their current order. */
  ids: string[];
  /** Move the row at `from` so it ends up at index `to`. */
  onMove: (from: number, to: number) => void;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}

/**
 * A vertical list reordered by each row's grip handle (`useReorderItem`).
 *
 * Rows never move mid-drag: geometry is measured once at pickup, a clone of the row follows
 * the pointer, and an insertion line marks the landing spot. Everything that tracks the
 * pointer is written straight to the DOM, so a drag re-renders nothing but the pickup and
 * the drop. The nearest scroll container auto-scrolls at its edges, and on drop every row
 * glides from where it was (the dropped one from under the pointer) to where it landed.
 */
export function ReorderList({ ids, onMove, disabled = false, className, children }: ReorderListProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const nodes = useRef(new Map<string, HTMLElement>());
  const nodeRefs = useRef(new Map<string, (el: HTMLElement | null) => void>());
  const [activeId, setActiveId] = useState<string | null>(null);
  const flipFrom = useRef<Map<string, DOMRect> | null>(null);

  const latest = useRef({ ids, onMove, disabled });
  latest.current = { ids, onMove, disabled };

  const nodeRef = useCallback((id: string) => {
    let ref = nodeRefs.current.get(id);
    if (!ref) {
      ref = (el) => {
        if (el) nodes.current.set(id, el);
        else nodes.current.delete(id);
      };
      nodeRefs.current.set(id, ref);
    }
    return ref;
  }, []);

  const move = useCallback((from: number, to: number, fromRects?: Record<string, DOMRect>) => {
    if (from === to) return;
    const rects = new Map<string, DOMRect>();
    for (const [id, el] of nodes.current) rects.set(id, el.getBoundingClientRect());
    for (const [id, rect] of Object.entries(fromRects ?? {})) rects.set(id, rect);
    flipFrom.current = rects;
    latest.current.onMove(from, to);
  }, []);

  // FLIP: runs when the order the parent passes back has actually changed.
  const orderKey = ids.join('\u0000');
  useLayoutEffect(() => {
    const from = flipFrom.current;
    flipFrom.current = null;
    if (!from || prefersReducedMotion()) return;
    for (const [id, el] of nodes.current) {
      const before = from.get(id);
      if (!before || typeof el.animate !== 'function') continue;
      const after = el.getBoundingClientRect();
      const dy = before.top + before.height / 2 - (after.top + after.height / 2);
      if (Math.abs(dy) < 1) continue;
      el.animate(
        [{ transform: `translate(0, ${dy}px)` }, { transform: 'translate(0, 0)' }],
        { duration: SETTLE_MS, easing: SETTLE_EASING },
      );
    }
  }, [orderKey]);

  const activeIdRef = useRef<string | null>(null);
  const startRef = useRef<(id: string, down: PointerEvent) => void>(() => {});

  const onHandlePointerDown = useCallback((id: string, e: ReactPointerEvent) => {
    if (latest.current.disabled || activeIdRef.current !== null) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // No text selection or focus-steal from a mouse drag; touch is already `touch-action: none`.
    if (e.pointerType === 'mouse') e.preventDefault();
    startRef.current(id, e.nativeEvent);
  }, []);

  const onHandleKeyDown = useCallback((id: string, e: ReactKeyboardEvent) => {
    if (latest.current.disabled) return;
    const i = latest.current.ids.indexOf(id);
    const to = e.key === 'ArrowUp' ? i - 1 : e.key === 'ArrowDown' ? i + 1 : -1;
    if (i < 0 || to < 0 || to >= latest.current.ids.length) return;
    e.preventDefault();
    move(i, to);
  }, [move]);

  startRef.current = startGesture;
  function startGesture(id: string, down: PointerEvent) {
    const pointerId = down.pointerId;
    const startX = down.clientX;
    const startY = down.clientY;
    let lastY = startY;
    let drag: {
      from: number;
      to: number;
      slots: Slot[];
      grabOffset: number;
      ghost: HTMLElement;
      indicator: HTMLElement;
      scroller: Element;
      raf: number;
    } | null = null;

    const listContentY = (y: number) => {
      const list = listRef.current!;
      return y - list.getBoundingClientRect().top + list.scrollTop;
    };

    const aim = () => {
      if (!drag) return;
      drag.ghost.style.transform = `translate3d(0, ${lastY - drag.grabOffset}px, 0)`;
      const y = listContentY(lastY);
      const others = drag.slots.filter((s) => s.id !== id);
      let at = others.findIndex((s) => y < s.top + s.height / 2);
      if (at < 0) at = others.length;
      if (at === drag.to) return;
      drag.to = at;
      if (at === drag.from) {
        drag.indicator.style.opacity = '0';
        return;
      }
      const above = others[at - 1];
      const below = others[at];
      const lineY = above && below
        ? (above.top + above.height + below.top) / 2
        : below ? below.top - 2 : above.top + above.height + 2;
      drag.indicator.style.top = `${lineY - 1}px`;
      drag.indicator.style.opacity = '1';
    };

    const pickup = () => {
      const list = listRef.current;
      const source = nodes.current.get(id);
      if (!list || !source) return;
      const order = latest.current.ids;
      const from = order.indexOf(id);
      if (from < 0) return;

      const listRect = list.getBoundingClientRect();
      const slots: Slot[] = [];
      for (const slotId of order) {
        const el = nodes.current.get(slotId);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        slots.push({ id: slotId, top: r.top - listRect.top + list.scrollTop, height: r.height });
      }

      const sourceRect = source.getBoundingClientRect();
      const ghost = makeGhost(source, sourceRect);
      document.body.append(ghost);

      const indicator = document.createElement('div');
      indicator.setAttribute('aria-hidden', 'true');
      indicator.className = INDICATOR_CLASS;
      indicator.style.opacity = '0';
      list.append(indicator);

      drag = {
        from,
        to: from,
        slots,
        grabOffset: startY - sourceRect.top,
        ghost,
        indicator,
        scroller: scrollParent(list),
        raf: requestAnimationFrame(autoScroll),
      };
      activeIdRef.current = id;
      setActiveId(id);
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'grabbing';
      aim();
    };

    // Pointer events stop when the pointer is still, so the edge scroll runs its own frames.
    const autoScroll = () => {
      if (!drag) return;
      drag.raf = requestAnimationFrame(autoScroll);
      const el = drag.scroller;
      const isRoot = el === document.scrollingElement || el === document.documentElement;
      const rect = isRoot ? { top: 0, bottom: window.innerHeight } : el.getBoundingClientRect();
      const zone = Math.min(EDGE_ZONE_PX, (rect.bottom - rect.top) / 2);
      const fromTop = lastY - rect.top;
      const fromBottom = rect.bottom - lastY;
      let delta = 0;
      if (fromTop < zone) delta = -Math.max(EDGE_MIN_PX, ((zone - Math.max(0, fromTop)) / zone) * EDGE_MAX_PX);
      else if (fromBottom < zone) delta = Math.max(EDGE_MIN_PX, ((zone - Math.max(0, fromBottom)) / zone) * EDGE_MAX_PX);
      if (delta === 0) return;
      const before = el.scrollTop;
      el.scrollTop = before + delta;
      if (el.scrollTop !== before) aim();
    };

    const finish = (commit: boolean) => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
      window.removeEventListener('keydown', onKeyDown, true);
      if (!drag) return;
      const { from, to, ghost, indicator, raf } = drag;
      drag = null;
      cancelAnimationFrame(raf);
      const ghostRect = ghost.getBoundingClientRect();
      ghost.remove();
      indicator.remove();
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      activeIdRef.current = null;
      setActiveId(null);
      if (commit && to !== from) move(from, to, { [id]: ghostRect });
    };

    const onPointerMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      lastY = ev.clientY;
      if (!drag) {
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) > PICKUP_PX) pickup();
        return;
      }
      if (ev.cancelable) ev.preventDefault();
      aim();
    };
    const onPointerUp = (ev: PointerEvent) => {
      if (ev.pointerId === pointerId) finish(true);
    };
    const onPointerCancel = (ev: PointerEvent) => {
      if (ev.pointerId === pointerId) finish(false);
    };
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape' || !drag) return;
      ev.preventDefault();
      ev.stopPropagation();
      finish(false);
    };

    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
    // Capture, so Escape cancels the drag rather than closing the dialog around it.
    window.addEventListener('keydown', onKeyDown, true);
  }

  const value = useMemo<ReorderContextValue>(
    () => ({ activeId, disabled, nodeRef, onHandlePointerDown, onHandleKeyDown }),
    [activeId, disabled, nodeRef, onHandlePointerDown, onHandleKeyDown],
  );

  return (
    <ReorderContext.Provider value={value}>
      <div ref={listRef} className={cn('relative', className)}>
        {children}
      </div>
    </ReorderContext.Provider>
  );
}

const INDICATOR_CLASS =
  'pointer-events-none absolute inset-x-1 z-10 h-0.5 rounded-full bg-primary shadow-[0_0_6px_hsl(var(--primary)/0.7)] transition-[top,opacity] duration-100 ease-out motion-reduce:transition-none';

/** A static copy of the row, fixed to the viewport and moved by transform. */
function makeGhost(source: HTMLElement, rect: DOMRect): HTMLElement {
  const ghost = source.cloneNode(true) as HTMLElement;
  // Ids must stay unique, and nothing in the copy is interactive.
  ghost.removeAttribute('id');
  ghost.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
  ghost.setAttribute('aria-hidden', 'true');
  ghost.setAttribute('inert', '');
  // Detached from its ancestors, it inherits nothing from them.
  const cs = getComputedStyle(source);
  Object.assign(ghost.style, {
    position: 'fixed',
    left: `${rect.left}px`,
    top: '0',
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    margin: '0',
    zIndex: '9999',
    pointerEvents: 'none',
    boxSizing: 'border-box',
    color: cs.color,
    font: cs.font,
    borderRadius: cs.borderRadius === '0px' ? '0.5rem' : cs.borderRadius,
    background: 'hsl(var(--background))',
    boxShadow: '0 10px 30px -8px rgb(0 0 0 / 0.45), 0 0 0 1px hsl(var(--primary) / 0.5)',
    opacity: '0.95',
    willChange: 'transform',
    transition: 'none',
  } satisfies Partial<CSSStyleDeclaration>);
  return ghost;
}

/** The nearest scrollable ancestor (or the list itself), else the document. */
function scrollParent(el: HTMLElement): Element {
  for (let node: HTMLElement | null = el; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) return node;
  }
  return document.scrollingElement ?? document.documentElement;
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

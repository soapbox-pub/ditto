/**
 * ItemCarousel — Single-focus carousel for room items.
 *
 * Fixed-size slots prevent layout reflow on item switch.
 * Mobile: focused item only. Desktop: prev/next previews.
 */

import { useState, useCallback, useEffect, useMemo, type CSSProperties } from 'react';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CarouselEntry {
  id: string;
  icon: React.ReactNode;
  label: string;
  meta?: string;
}

interface ItemCarouselProps {
  items: CarouselEntry[];
  onUse: (id: string) => void;
  activeItemId?: string | null;
  disabled?: boolean;
  onFocusChange?: (entry: CarouselEntry) => void;
  /** When set, the carousel visually guides the user toward this item. */
  highlightId?: string | null;
  /** When set, seeds the initial index to this item's position. */
  initialItemId?: string | null;
  /** Optional pointer-down handler forwarded to the center (focused) item.
   *  Used by KitchenBar for food drag-to-feed. Receives the currently focused
   *  entry so the caller doesn't need to track index state.  After pointerdown,
   *  the drag hook owns the lifecycle via global window listeners — the button
   *  does not need onPointerMove / onPointerUp / onPointerCancel. */
  centerPointerHandlers?: {
    onPointerDown: (e: React.PointerEvent, entry: CarouselEntry) => void;
  };
  className?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ItemCarousel({
  items,
  onUse,
  activeItemId,
  disabled,
  onFocusChange,
  highlightId,
  centerPointerHandlers,
  initialItemId,
  className,
}: ItemCarouselProps) {
  const [index, setIndex] = useState(() => {
    if (initialItemId) {
      const i = items.findIndex(item => item.id === initialItemId);
      if (i !== -1) return i;
    }
    return 0;
  });
  const count = items.length;

  // Realign when initialItemId changes after mount (e.g. Blobbi switch causes
  // useLocalStorage to re-read a different key).
  useEffect(() => {
    if (!initialItemId) return;
    const target = items.findIndex(item => item.id === initialItemId);
    if (target !== -1) setIndex(target);
  }, [initialItemId]); // eslint-disable-line react-hooks/exhaustive-deps -- intentionally omits items to avoid fighting user navigation

  // Clamp or preserve index when items change.
  // Only reset when the focused item no longer exists or the index is out of
  // bounds — not on every reference change (which happens every render if the
  // parent rebuilds the array).
  useEffect(() => {
    setIndex((prev) => {
      if (count === 0) return 0;
      if (prev < count && items[prev]) return prev; // still valid
      return Math.min(prev, count - 1);              // clamp to new bounds
    });
  }, [items, count]);

  // Clamp synchronously: the effect above resets state *after* render, so on
  // the first render with a shorter items array the stale index can exceed
  // the new length. Using the clamped value for all reads below prevents the
  // out-of-bounds access that would otherwise crash.
  const safeIndex = count === 0 ? 0 : Math.min(index, count - 1);

  const prev = useCallback(() => {
    setIndex(i => {
      const clamped = Math.min(i, count - 1);
      const n = (clamped - 1 + count) % count;
      onFocusChange?.(items[n]);
      return n;
    });
  }, [count, items, onFocusChange]);

  const next = useCallback(() => {
    setIndex(i => {
      const clamped = Math.min(i, count - 1);
      const n = (clamped + 1) % count;
      onFocusChange?.(items[n]);
      return n;
    });
  }, [count, items, onFocusChange]);

  // ─── Guide highlight logic ──────────────────────────────────────────────
  // Determine if the highlight target is currently focused, or which arrow
  // direction leads to it via the shortest path in the circular list.
  const highlightArrow = useMemo<'left' | 'right' | null>(() => {
    if (!highlightId || count < 2) return null;
    const targetIdx = items.findIndex(i => i.id === highlightId);
    if (targetIdx === -1 || targetIdx === safeIndex) return null;

    const rightDist = (targetIdx - safeIndex + count) % count;
    const leftDist = (safeIndex - targetIdx + count) % count;
    return rightDist <= leftDist ? 'right' : 'left';
  }, [highlightId, items, safeIndex, count]);

  const isHighlightFocused = !!highlightId && items[safeIndex]?.id === highlightId;

  if (count === 0) {
    return (
      <div className={cn('flex items-center justify-center h-[4.5rem] sm:h-[5.5rem]', className)}>
        <p className="text-xs text-muted-foreground/50">Nothing here yet</p>
      </div>
    );
  }

  const current = items[safeIndex];
  const prevItem = items[(safeIndex - 1 + count) % count];
  const nextItem = items[(safeIndex + 1) % count];
  const isThisActive = activeItemId === current.id;
  const showPreviews = count >= 3;

  return (
    <div className={cn('flex items-center justify-center', className)}>
      <button
        onClick={prev}
        disabled={disabled}
        className={cn(
          'size-7 sm:size-8 rounded-full flex items-center justify-center shrink-0',
          'text-muted-foreground/40 hover:text-foreground/70 hover:bg-accent/40',
          'transition-all duration-200 active:scale-90',
          disabled && 'opacity-30 pointer-events-none',
          highlightArrow === 'left' && 'text-primary',
        )}
        style={highlightArrow === 'left' ? { animation: 'guide-glow-slow 1.1s linear infinite' } as CSSProperties : undefined}
        aria-label="Previous item"
      >
        <ChevronLeft className="size-4" />
      </button>

      {showPreviews && (
        <div className="hidden sm:flex items-center justify-center w-10 h-12 shrink-0 overflow-hidden pointer-events-none select-none">
          <div className="opacity-20 scale-[0.6]">
            <span className="text-2xl leading-none block">{prevItem.icon}</span>
          </div>
        </div>
      )}

      <button
        onClick={centerPointerHandlers ? undefined : () => onUse(current.id)}
        onPointerDown={centerPointerHandlers ? (e: React.PointerEvent<HTMLButtonElement>) => centerPointerHandlers.onPointerDown(e, current) : undefined}
        disabled={disabled}
        data-food-drag={centerPointerHandlers ? '' : undefined}
        className={cn(
          'relative flex flex-col items-center justify-center shrink-0 overflow-hidden',
          'w-20 h-[4.5rem] sm:w-24 sm:h-[5.5rem] rounded-2xl',
          'transition-colors duration-200',
          'hover:bg-accent/20 active:scale-95',
          isThisActive && 'bg-accent/40',
          disabled && !isThisActive && 'opacity-50 pointer-events-none',
          isHighlightFocused && 'ring-2 ring-primary/60',
          centerPointerHandlers && 'touch-none',
        )}
        style={isHighlightFocused ? { animation: 'guide-glow-slow 1.1s linear infinite' } as CSSProperties : undefined}
      >
        <span className="text-4xl sm:text-5xl leading-none">{current.icon}</span>
        <span className="text-[10px] sm:text-xs font-medium text-foreground/70 mt-0.5 w-16 sm:w-20 text-center truncate">
          {current.label}
        </span>
        {isThisActive && <Loader2 className="size-3.5 animate-spin text-primary absolute bottom-0.5" />}
      </button>

      {showPreviews && (
        <div className="hidden sm:flex items-center justify-center w-10 h-12 shrink-0 overflow-hidden pointer-events-none select-none">
          <div className="opacity-20 scale-[0.6]">
            <span className="text-2xl leading-none block">{nextItem.icon}</span>
          </div>
        </div>
      )}

      <button
        onClick={next}
        disabled={disabled}
        className={cn(
          'size-7 sm:size-8 rounded-full flex items-center justify-center shrink-0',
          'text-muted-foreground/40 hover:text-foreground/70 hover:bg-accent/40',
          'transition-all duration-200 active:scale-90',
          disabled && 'opacity-30 pointer-events-none',
          highlightArrow === 'right' && 'text-primary',
        )}
        style={highlightArrow === 'right' ? { animation: 'guide-glow-slow 1.1s linear infinite' } as CSSProperties : undefined}
        aria-label="Next item"
      >
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}

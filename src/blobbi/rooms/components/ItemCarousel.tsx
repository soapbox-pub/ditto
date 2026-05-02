/**
 * ItemCarousel — Single-focus carousel for room items.
 *
 * Fixed-size slots prevent layout reflow on item switch.
 * Mobile: focused item only. Desktop: prev/next previews.
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ROOM_CONTROL_SURFACE_SUBTLE, ROOM_GUIDE_HIGHLIGHT } from '../lib/room-layout';

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
  className?: string;
  /** Seed the initial focused item by id (e.g. from localStorage). Falls back to index 0. */
  initialItemId?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ItemCarousel({
  items,
  onUse,
  activeItemId,
  disabled,
  onFocusChange,
  highlightId,
  className,
  initialItemId,
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

  const prev = useCallback(() => {
    setIndex(i => {
      const n = (i - 1 + count) % count;
      onFocusChange?.(items[n]);
      return n;
    });
  }, [count, items, onFocusChange]);

  const next = useCallback(() => {
    setIndex(i => {
      const n = (i + 1) % count;
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
    if (targetIdx === -1 || targetIdx === index) return null;

    const rightDist = (targetIdx - index + count) % count;
    const leftDist = (index - targetIdx + count) % count;
    return rightDist <= leftDist ? 'right' : 'left';
  }, [highlightId, items, index, count]);

  const isHighlightFocused = !!highlightId && items[index]?.id === highlightId;

  if (count === 0) {
    return (
      <div className={cn('flex items-center justify-center h-[4.5rem] sm:h-[5.5rem]', className)}>
        <p className="text-xs text-muted-foreground/50">Nothing here yet</p>
      </div>
    );
  }

  const current = items[index];
  const prevItem = items[(index - 1 + count) % count];
  const nextItem = items[(index + 1) % count];
  const isThisActive = activeItemId === current.id;
  const showPreviews = count >= 3;

  return (
    <div className={cn('flex items-center justify-center gap-2', className)}>
      <button
        onClick={prev}
        disabled={disabled}
        className={cn(
          'size-7 sm:size-8 rounded-full flex items-center justify-center shrink-0',
          ROOM_CONTROL_SURFACE_SUBTLE,
          'text-muted-foreground/60 hover:text-foreground/80 hover:bg-background/70',
          'transition-all duration-200 active:scale-90',
          disabled && 'opacity-30 pointer-events-none',
          highlightArrow === 'left' && ROOM_GUIDE_HIGHLIGHT,
        )}
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
        onClick={() => onUse(current.id)}
        disabled={disabled}
        className={cn(
          'relative flex flex-col items-center justify-center shrink-0 overflow-hidden',
          'w-18 h-16 sm:w-24 sm:h-[5.5rem] rounded-2xl',
          ROOM_CONTROL_SURFACE_SUBTLE,
          'transition-all duration-200',
          'hover:bg-background/60 active:scale-95',
          isThisActive && 'bg-background/60',
          disabled && !isThisActive && 'opacity-50 pointer-events-none',
          isHighlightFocused && ROOM_GUIDE_HIGHLIGHT,
        )}
      >
        <span className="text-3xl sm:text-5xl leading-none">{current.icon}</span>
        <span className="text-[10px] sm:text-xs font-medium text-foreground/80 mt-0.5 w-16 sm:w-20 text-center truncate">
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
          ROOM_CONTROL_SURFACE_SUBTLE,
          'text-muted-foreground/60 hover:text-foreground/80 hover:bg-background/70',
          'transition-all duration-200 active:scale-90',
          disabled && 'opacity-30 pointer-events-none',
          highlightArrow === 'right' && ROOM_GUIDE_HIGHLIGHT,
        )}
        aria-label="Next item"
      >
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}

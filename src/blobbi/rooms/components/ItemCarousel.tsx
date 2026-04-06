// src/blobbi/rooms/components/ItemCarousel.tsx

/**
 * ItemCarousel — Single-focus carousel for room items.
 *
 * Mobile:  focused item only + compact arrows (no prev/next previews)
 * Desktop: focused item + translucent prev/next previews + arrows
 *
 * Each "item" is an opaque entry with id, icon, label, and an onUse callback.
 */

import { useState, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CarouselEntry {
  id: string;
  /** Emoji string or ReactNode rendered at large size */
  icon: React.ReactNode;
  label: string;
}

interface ItemCarouselProps {
  items: CarouselEntry[];
  /** Called when the user taps the focused item */
  onUse: (id: string) => void;
  /** Item id currently being used (shows spinner) */
  activeItemId?: string | null;
  /** Whether any action is in progress */
  disabled?: boolean;
  className?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ItemCarousel({
  items,
  onUse,
  activeItemId,
  disabled,
  className,
}: ItemCarouselProps) {
  const [index, setIndex] = useState(0);

  const count = items.length;

  const prev = useCallback(() => {
    setIndex(i => (i - 1 + count) % count);
  }, [count]);

  const next = useCallback(() => {
    setIndex(i => (i + 1) % count);
  }, [count]);

  if (count === 0) {
    return (
      <div className={cn('flex items-center justify-center py-3', className)}>
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
    <div className={cn('flex items-center justify-center', className)}>
      {/* Left arrow */}
      <button
        onClick={prev}
        disabled={disabled}
        className={cn(
          'size-7 sm:size-8 rounded-full flex items-center justify-center shrink-0',
          'text-muted-foreground/40 hover:text-foreground/70 hover:bg-accent/40',
          'transition-all duration-200 active:scale-90',
          disabled && 'opacity-30 pointer-events-none',
        )}
        aria-label="Previous item"
      >
        <ChevronLeft className="size-4" />
      </button>

      {/* Preview (prev) — desktop only, 3+ items */}
      {showPreviews && (
        <div className="hidden sm:flex flex-col items-center opacity-25 scale-[0.65] shrink-0 w-10 pointer-events-none select-none">
          <span className="text-2xl leading-none">{prevItem.icon}</span>
        </div>
      )}

      {/* Focused item */}
      <button
        onClick={() => onUse(current.id)}
        disabled={disabled}
        className={cn(
          'relative flex flex-col items-center gap-0.5 py-1 px-3 sm:px-4 rounded-2xl transition-all duration-200 shrink-0',
          'hover:-translate-y-0.5 active:scale-95',
          isThisActive && 'bg-accent/40',
          disabled && !isThisActive && 'opacity-50 pointer-events-none',
        )}
      >
        <span className="text-4xl sm:text-5xl leading-none transition-transform duration-200 hover:scale-110">
          {current.icon}
        </span>
        <span className="text-[10px] sm:text-xs font-medium text-foreground/70">{current.label}</span>
        {isThisActive && (
          <Loader2 className="size-3.5 animate-spin text-primary absolute -bottom-1" />
        )}
      </button>

      {/* Preview (next) — desktop only, 3+ items */}
      {showPreviews && (
        <div className="hidden sm:flex flex-col items-center opacity-25 scale-[0.65] shrink-0 w-10 pointer-events-none select-none">
          <span className="text-2xl leading-none">{nextItem.icon}</span>
        </div>
      )}

      {/* Right arrow */}
      <button
        onClick={next}
        disabled={disabled}
        className={cn(
          'size-7 sm:size-8 rounded-full flex items-center justify-center shrink-0',
          'text-muted-foreground/40 hover:text-foreground/70 hover:bg-accent/40',
          'transition-all duration-200 active:scale-90',
          disabled && 'opacity-30 pointer-events-none',
        )}
        aria-label="Next item"
      >
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}

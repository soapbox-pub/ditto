// src/blobbi/rooms/components/ItemCarousel.tsx

/**
 * ItemCarousel — Single-focus carousel for room items.
 *
 * The focused item area has a fixed width/height so the arrows and
 * side previews never shift when cycling between items.
 *
 * Mobile:  focused item only + compact arrows (no prev/next previews)
 * Desktop: focused item + translucent prev/next previews + arrows
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
  /** Optional metadata attached to the entry (e.g. item type) */
  meta?: string;
}

interface ItemCarouselProps {
  items: CarouselEntry[];
  /** Called when the user taps the focused item */
  onUse: (id: string) => void;
  /** Item id currently being used (shows spinner) */
  activeItemId?: string | null;
  /** Whether any action is in progress */
  disabled?: boolean;
  /** Called when the focused item changes (for conditional side actions) */
  onFocusChange?: (entry: CarouselEntry) => void;
  className?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ItemCarousel({
  items,
  onUse,
  activeItemId,
  disabled,
  onFocusChange,
  className,
}: ItemCarouselProps) {
  const [index, setIndex] = useState(0);

  const count = items.length;

  const prev = useCallback(() => {
    setIndex(i => {
      const next = (i - 1 + count) % count;
      onFocusChange?.(items[next]);
      return next;
    });
  }, [count, items, onFocusChange]);

  const next = useCallback(() => {
    setIndex(i => {
      const next = (i + 1) % count;
      onFocusChange?.(items[next]);
      return next;
    });
  }, [count, items, onFocusChange]);

  if (count === 0) {
    return (
      <div className={cn('flex items-center justify-center h-16', className)}>
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
      {/* Left arrow — fixed size */}
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

      {/* Preview (prev) — desktop only, fixed slot */}
      {showPreviews && (
        <div className="hidden sm:flex items-center justify-center w-10 h-12 shrink-0 pointer-events-none select-none">
          <div className="opacity-25 scale-[0.65]">
            <span className="text-2xl leading-none">{prevItem.icon}</span>
          </div>
        </div>
      )}

      {/* Focused item — FIXED SIZE container so layout never shifts */}
      <button
        onClick={() => onUse(current.id)}
        disabled={disabled}
        className={cn(
          'relative flex flex-col items-center justify-center shrink-0',
          'w-20 h-16 sm:w-24 sm:h-20 rounded-2xl transition-colors duration-200',
          'hover:bg-accent/20 active:scale-95',
          isThisActive && 'bg-accent/40',
          disabled && !isThisActive && 'opacity-50 pointer-events-none',
        )}
      >
        <span className="text-4xl sm:text-5xl leading-none">
          {current.icon}
        </span>
        <span className="text-[10px] sm:text-xs font-medium text-foreground/70 mt-0.5 truncate max-w-full px-1">
          {current.label}
        </span>
        {isThisActive && (
          <Loader2 className="size-3.5 animate-spin text-primary absolute -bottom-0.5" />
        )}
      </button>

      {/* Preview (next) — desktop only, fixed slot */}
      {showPreviews && (
        <div className="hidden sm:flex items-center justify-center w-10 h-12 shrink-0 pointer-events-none select-none">
          <div className="opacity-25 scale-[0.65]">
            <span className="text-2xl leading-none">{nextItem.icon}</span>
          </div>
        </div>
      )}

      {/* Right arrow — fixed size */}
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

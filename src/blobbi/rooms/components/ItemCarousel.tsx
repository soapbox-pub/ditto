// src/blobbi/rooms/components/ItemCarousel.tsx

/**
 * ItemCarousel — Single-focus carousel for room items.
 *
 * Layout stability guarantees:
 * - The entire carousel width is deterministic (arrows + previews + focus slot)
 * - Focused item uses a fixed-size container with overflow-hidden
 * - Label is clamped to a fixed max-width and single line
 * - Switching items never causes reflow or arrow movement
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

  if (count === 0) {
    return (
      // Empty state matches the height of a populated carousel
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
    <div className={cn('flex items-center justify-center', className)}>
      {/* Left arrow — fixed 28/32px */}
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

      {/* Preview (prev) — desktop only, fixed 40x48px slot */}
      {showPreviews && (
        <div className="hidden sm:flex items-center justify-center w-10 h-12 shrink-0 overflow-hidden pointer-events-none select-none">
          <div className="opacity-20 scale-[0.6]">
            <span className="text-2xl leading-none block">{prevItem.icon}</span>
          </div>
        </div>
      )}

      {/* Focused item — FIXED 80x72 / 96x88 container, never resizes */}
      <button
        onClick={() => onUse(current.id)}
        disabled={disabled}
        className={cn(
          'relative flex flex-col items-center justify-center shrink-0 overflow-hidden',
          'w-20 h-[4.5rem] sm:w-24 sm:h-[5.5rem] rounded-2xl',
          'transition-colors duration-200',
          'hover:bg-accent/20 active:scale-95',
          isThisActive && 'bg-accent/40',
          disabled && !isThisActive && 'opacity-50 pointer-events-none',
        )}
      >
        <span className="text-4xl sm:text-5xl leading-none">
          {current.icon}
        </span>
        {/* Label: fixed max-width, single line, ellipsis */}
        <span className="text-[10px] sm:text-xs font-medium text-foreground/70 mt-0.5 w-16 sm:w-20 text-center truncate">
          {current.label}
        </span>
        {isThisActive && (
          <Loader2 className="size-3.5 animate-spin text-primary absolute bottom-0.5" />
        )}
      </button>

      {/* Preview (next) — desktop only, fixed 40x48px slot */}
      {showPreviews && (
        <div className="hidden sm:flex items-center justify-center w-10 h-12 shrink-0 overflow-hidden pointer-events-none select-none">
          <div className="opacity-20 scale-[0.6]">
            <span className="text-2xl leading-none block">{nextItem.icon}</span>
          </div>
        </div>
      )}

      {/* Right arrow — fixed 28/32px */}
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

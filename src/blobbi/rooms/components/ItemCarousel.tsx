// src/blobbi/rooms/components/ItemCarousel.tsx

/**
 * ItemCarousel — Single-focus carousel for room items.
 *
 * Shows one main item at centre with translucent prev/next previews.
 * Left/right arrows cycle through items in a loop.
 *
 * Each "item" is an opaque entry with id, icon, label, and an onUse callback.
 * The carousel doesn't know about shop items or actions — the parent maps them.
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
      <div className={cn('flex items-center justify-center py-4', className)}>
        <p className="text-xs text-muted-foreground/50">Nothing here yet</p>
      </div>
    );
  }

  const current = items[index];
  const prevItem = items[(index - 1 + count) % count];
  const nextItem = items[(index + 1) % count];
  const isThisActive = activeItemId === current.id;

  return (
    <div className={cn('flex items-center justify-center gap-1', className)}>
      {/* Left arrow */}
      <button
        onClick={prev}
        disabled={disabled}
        className={cn(
          'size-8 rounded-full flex items-center justify-center shrink-0',
          'text-muted-foreground/40 hover:text-foreground/70 hover:bg-accent/40',
          'transition-all duration-200 active:scale-90',
          disabled && 'opacity-30 pointer-events-none',
        )}
        aria-label="Previous item"
      >
        <ChevronLeft className="size-4" />
      </button>

      {/* Preview (prev) — only when 3+ items */}
      {count >= 3 && (
        <div className="flex flex-col items-center opacity-30 scale-75 shrink-0 w-12 pointer-events-none select-none">
          <span className="text-2xl leading-none">{prevItem.icon}</span>
        </div>
      )}

      {/* Focused item */}
      <button
        onClick={() => onUse(current.id)}
        disabled={disabled}
        className={cn(
          'relative flex flex-col items-center gap-1 py-2 px-4 rounded-2xl transition-all duration-200 shrink-0',
          'hover:-translate-y-0.5 active:scale-95',
          isThisActive && 'bg-accent/40',
          disabled && !isThisActive && 'opacity-50 pointer-events-none',
        )}
      >
        <span className="text-5xl sm:text-6xl leading-none transition-transform duration-200 hover:scale-110">
          {current.icon}
        </span>
        <span className="text-xs font-medium text-foreground/70">{current.label}</span>
        {isThisActive && (
          <Loader2 className="size-4 animate-spin text-primary absolute -bottom-0.5" />
        )}
      </button>

      {/* Preview (next) — only when 3+ items */}
      {count >= 3 && (
        <div className="flex flex-col items-center opacity-30 scale-75 shrink-0 w-12 pointer-events-none select-none">
          <span className="text-2xl leading-none">{nextItem.icon}</span>
        </div>
      )}

      {/* Right arrow */}
      <button
        onClick={next}
        disabled={disabled}
        className={cn(
          'size-8 rounded-full flex items-center justify-center shrink-0',
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

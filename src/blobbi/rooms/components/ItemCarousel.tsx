/**
 * ItemCarousel — Single-focus carousel for room items.
 *
 * Fixed-size slots prevent layout reflow on item switch.
 * Mobile: focused item only. sm+: tappable prev/next previews.
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { FormattedMessage, useIntl } from 'react-intl';
import { cn } from '@/lib/utils';
import { ROOM_CONTROL_SURFACE, ROOM_GUIDE_HIGHLIGHT } from '../lib/room-layout';

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
  /**
   * Lets the focused item be dragged into the room. After pointerdown the
   * drag hook owns the gesture through window listeners; a plain tap still
   * uses the item through the click.
   */
  centerPointerHandlers?: {
    canDrag: (entry: CarouselEntry) => boolean;
    onPointerDown: (e: React.PointerEvent, entry: CarouselEntry) => void;
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

const ARROW_CLASS = cn(
  'size-[2.3em] rounded-full flex items-center justify-center shrink-0',
  ROOM_CONTROL_SURFACE,
  'text-foreground/70 hover:text-foreground hover:bg-background/80',
  'transition-all duration-200 active:scale-90 motion-reduce:active:scale-100',
  'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring',
);

const PREVIEW_CLASS = 'hidden sm:flex items-center justify-center size-[2.6em] shrink-0 rounded-full select-none opacity-60 hover:opacity-90 transition-opacity duration-200';

export function ItemCarousel({
  items,
  onUse,
  activeItemId,
  disabled,
  onFocusChange,
  highlightId,
  centerPointerHandlers,
  initialItemId,
}: ItemCarouselProps) {
  const intl = useIntl();
  const [index, setIndex] = useState(() => Math.max(0, items.findIndex(item => item.id === initialItemId)));
  const count = items.length;

  // Realign when initialItemId changes after mount (e.g. Blobbi switch causes
  // useLocalStorage to re-read a different key).
  useEffect(() => {
    if (!initialItemId) return;
    const target = items.findIndex(item => item.id === initialItemId);
    if (target !== -1) setIndex(target);
  }, [initialItemId]); // eslint-disable-line react-hooks/exhaustive-deps -- intentionally omits items to avoid fighting user navigation

  // Reads clamp: the list can shrink under the stored index
  const safeIndex = count === 0 ? 0 : Math.min(index, count - 1);

  const step = useCallback((dir: 1 | -1) => {
    const n = (safeIndex + dir + count) % count;
    setIndex(n);
    onFocusChange?.(items[n]);
  }, [safeIndex, count, items, onFocusChange]);

  // Guide: which arrow leads to the highlighted item the short way round
  const highlightArrow = useMemo<'left' | 'right' | null>(() => {
    if (!highlightId || count < 2) return null;
    const targetIdx = items.findIndex(i => i.id === highlightId);
    if (targetIdx === -1 || targetIdx === safeIndex) return null;
    const rightDist = (targetIdx - safeIndex + count) % count;
    const leftDist = (safeIndex - targetIdx + count) % count;
    return rightDist <= leftDist ? 'right' : 'left';
  }, [highlightId, items, safeIndex, count]);

  if (count === 0) {
    return (
      <div className="flex items-center justify-center h-[3.6em]">
        <p className="text-[0.8em] text-muted-foreground">
          <FormattedMessage id="blobbiRoom.carousel.empty" defaultMessage="Nothing here yet" />
        </p>
      </div>
    );
  }

  const current = items[safeIndex];
  const isThisActive = activeItemId === current.id;
  const showPreviews = count >= 3;
  const draggable = !!centerPointerHandlers && !disabled && centerPointerHandlers.canDrag(current);

  const arrow = (dir: 1 | -1) => (
    <button
      onClick={() => step(dir)}
      disabled={disabled}
      className={cn(ARROW_CLASS, disabled && 'opacity-30 pointer-events-none', highlightArrow === (dir === 1 ? 'right' : 'left') && ROOM_GUIDE_HIGHLIGHT)}
      aria-label={dir === 1
        ? intl.formatMessage({ id: 'blobbiRoom.carousel.next', defaultMessage: 'Next item' })
        : intl.formatMessage({ id: 'blobbiRoom.carousel.previous', defaultMessage: 'Previous item' })}
    >
      {dir === 1 ? <ChevronRight className="size-[1.3em]" /> : <ChevronLeft className="size-[1.3em]" />}
    </button>
  );
  const preview = (dir: 1 | -1) => showPreviews && (
    <button type="button" onClick={() => step(dir)} disabled={disabled} tabIndex={-1} aria-hidden className={PREVIEW_CLASS}>
      <span className="text-[1.5em] leading-none block">{items[(safeIndex + dir + count) % count].icon}</span>
    </button>
  );

  return (
    <div className="flex items-center justify-center gap-[0.4em]">
      {arrow(-1)}
      {preview(-1)}

      <button
        onClick={() => onUse(current.id)}
        onPointerDown={draggable ? (e: React.PointerEvent<HTMLButtonElement>) => centerPointerHandlers?.onPointerDown(e, current) : undefined}
        disabled={disabled}
        data-room-drag={draggable ? '' : undefined}
        aria-label={intl.formatMessage({ id: 'blobbiRoom.carousel.use', defaultMessage: 'Use {item}' }, { item: current.label })}
        className={cn(
          'relative flex flex-col items-center justify-center shrink-0 overflow-hidden',
          'w-[5.25em] h-[4.75em] rounded-[1em]',
          'hover:bg-foreground/5 transition-all duration-200 active:scale-95 motion-reduce:active:scale-100',
          'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring',
          disabled && !isThisActive && 'opacity-50 pointer-events-none',
          highlightId === current.id && ROOM_GUIDE_HIGHLIGHT,
          draggable && 'touch-none cursor-grab',
        )}
      >
        <span className="text-[2.6em] leading-none">{current.icon}</span>
        <span className="text-[0.8em] font-medium text-foreground mt-[0.3em] w-[6em] text-center truncate">
          {current.label}
        </span>
        {isThisActive && <Loader2 className="size-3.5 animate-spin text-primary absolute bottom-0.5" />}
      </button>

      {preview(1)}
      {arrow(1)}
    </div>
  );
}

/**
 * MediaGrid — generic 3-column square-thumbnail grid for Nostr media events.
 *
 * Accepts any mix of event kinds and extracts the first image URL from each
 * event, handling both NIP-68/NIP-94 `imeta` tags (kind 20, 21, 22, 34236)
 * and inline image URLs from kind-1 content.
 *
 * Tapping a cell opens the Lightbox with author info + reactions in the
 * bottom bar and cross-event prev/next navigation.
 */

import { useState, useMemo, useCallback } from 'react';
import { Images } from 'lucide-react';
import { Blurhash } from 'react-blurhash';
import type { NostrEvent } from '@nostrify/nostrify';
import { Skeleton } from '@/components/ui/skeleton';
import { Lightbox } from '@/components/ImageGallery';
import { PhotoBottomBar } from '@/components/PhotoBottomBar';
import { cn } from '@/lib/utils';

// ── Media extraction ──────────────────────────────────────────────────────────

export interface MediaItem {
  /** The primary display URL (first image). */
  url: string;
  blurhash?: string;
  dim?: string;
  alt?: string;
  /** All image URLs in the event (for lightbox navigation within one event). */
  allUrls: string[];
  /** Map from URL → imeta metadata for Lightbox. */
  imetaMap: Map<string, { dim?: string; blurhash?: string }>;
  event: NostrEvent;
  /** Whether there are more images in this event beyond the thumbnail. */
  hasMultiple: boolean;
}

/** Parse all `imeta` entries from event tags (NIP-94 / NIP-68). */
function parseImeta(tags: string[][]): { url: string; blurhash?: string; dim?: string; alt?: string }[] {
  const results: { url: string; blurhash?: string; dim?: string; alt?: string }[] = [];
  for (const tag of tags) {
    if (tag[0] !== 'imeta') continue;
    const parts: Record<string, string> = {};
    for (let i = 1; i < tag.length; i++) {
      const sp = tag[i].indexOf(' ');
      if (sp !== -1) parts[tag[i].slice(0, sp)] = tag[i].slice(sp + 1);
    }
    if (parts.url) results.push({ url: parts.url, blurhash: parts.blurhash, dim: parts.dim, alt: parts.alt });
  }
  return results;
}

/** Extract image URLs embedded in plain-text content (kind 1). */
function extractImageUrls(content: string): string[] {
  const regex = /https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp|svg)(\?[^\s]*)?/gi;
  return content.match(regex) ?? [];
}

/**
 * Derive a `MediaItem` from a single Nostr event.
 * Returns `null` if no image can be found.
 */
export function eventToMediaItem(event: NostrEvent): MediaItem | null {
  // Prefer imeta tags (NIP-68 / NIP-94 native kinds and tagged kind 1s)
  const imetaEntries = parseImeta(event.tags);
  if (imetaEntries.length > 0) {
    const first = imetaEntries[0];
    const imetaMap = new Map<string, { dim?: string; blurhash?: string }>();
    for (const e of imetaEntries) imetaMap.set(e.url, { dim: e.dim, blurhash: e.blurhash });
    return {
      url: first.url,
      blurhash: first.blurhash,
      dim: first.dim,
      alt: first.alt,
      allUrls: imetaEntries.map((e) => e.url),
      imetaMap,
      event,
      hasMultiple: imetaEntries.length > 1,
    };
  }

  // Fallback: extract image URLs from kind-1 content
  if (event.kind === 1) {
    const urls = extractImageUrls(event.content);
    if (urls.length > 0) {
      return {
        url: urls[0],
        allUrls: urls,
        imetaMap: new Map(),
        event,
        hasMultiple: urls.length > 1,
      };
    }
  }

  return null;
}

// ── Grid thumbnail ────────────────────────────────────────────────────────────

function MediaThumb({ item, onClick }: { item: MediaItem; onClick: () => void }) {
  const [loaded, setLoaded] = useState(false);

  return (
    <button
      className="relative aspect-square overflow-hidden bg-muted group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      onClick={onClick}
      aria-label="View media"
    >
      {item.blurhash && (
        <Blurhash
          hash={item.blurhash}
          width="100%"
          height="100%"
          resolutionX={32}
          resolutionY={32}
          punch={1}
          className={cn('absolute inset-0 transition-opacity duration-300', loaded ? 'opacity-0' : 'opacity-100')}
          style={{ width: '100%', height: '100%' }}
        />
      )}
      {!item.blurhash && !loaded && (
        <Skeleton className="absolute inset-0 w-full h-full rounded-none" />
      )}

      <img
        src={item.url}
        alt={item.alt ?? ''}
        className={cn(
          'absolute inset-0 w-full h-full object-cover transition-all duration-300 group-hover:scale-[1.04]',
          loaded ? 'opacity-100' : 'opacity-0',
        )}
        loading="lazy"
        onLoad={() => setLoaded(true)}
      />

      {item.hasMultiple && (
        <div className="absolute top-1.5 right-1.5 bg-black/60 text-white rounded p-0.5">
          <Images className="size-3.5" />
        </div>
      )}
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/15 transition-colors duration-200" />
    </button>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

export function MediaGridSkeleton({ count = 15 }: { count?: number }) {
  return (
    <div className="grid grid-cols-3 gap-0.5">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="aspect-square w-full rounded-none" />
      ))}
    </div>
  );
}

// ── Overlay state ─────────────────────────────────────────────────────────────

interface OverlayState {
  itemIndex: number;   // which MediaItem in the list
  imageIndex: number;  // which image within that item's allUrls
}

// ── MediaGrid ─────────────────────────────────────────────────────────────────

interface MediaGridProps {
  events: NostrEvent[];
  className?: string;
}

/**
 * Generic 3-column media grid with a full-screen lightbox.
 * Pass any Nostr events that contain images; the component extracts
 * the first image per event and renders a square thumbnail grid.
 */
export function MediaGrid({ events, className }: MediaGridProps) {
  const items = useMemo(
    () => events.map(eventToMediaItem).filter((x): x is MediaItem => x !== null),
    [events],
  );

  const [overlay, setOverlay] = useState<OverlayState | null>(null);
  const [commentsEvent, setCommentsEvent] = useState<NostrEvent | null>(null);

  const activeItem = overlay !== null ? items[overlay.itemIndex] : null;
  const activeImages = activeItem?.allUrls ?? [];

  const openOverlay = useCallback((itemIndex: number) => {
    setOverlay({ itemIndex, imageIndex: 0 });
  }, []);

  const closeOverlay = useCallback(() => setOverlay(null), []);

  const goNextEvent = useCallback(() => {
    setOverlay((prev) => {
      if (!prev) return null;
      const next = prev.itemIndex + 1;
      return next < items.length ? { itemIndex: next, imageIndex: 0 } : prev;
    });
  }, [items.length]);

  const goPrevEvent = useCallback(() => {
    setOverlay((prev) => {
      if (!prev) return null;
      const next = prev.itemIndex - 1;
      return next >= 0 ? { itemIndex: next, imageIndex: 0 } : prev;
    });
  }, []);

  if (items.length === 0) return null;

  return (
    <>
      <div className={cn('grid grid-cols-3 gap-0.5', className)}>
        {items.map((item, i) => (
          <MediaThumb key={item.event.id} item={item} onClick={() => openOverlay(i)} />
        ))}
      </div>

      {overlay !== null && activeItem && activeImages.length > 0 && (
        <Lightbox
          images={activeImages}
          currentIndex={overlay.imageIndex}
          onClose={closeOverlay}
          onNext={() =>
            setOverlay((prev) =>
              prev ? { ...prev, imageIndex: Math.min(prev.imageIndex + 1, activeImages.length - 1) } : null,
            )
          }
          onPrev={() =>
            setOverlay((prev) =>
              prev ? { ...prev, imageIndex: Math.max(prev.imageIndex - 1, 0) } : null,
            )
          }
          onNextEvent={overlay.itemIndex < items.length - 1 ? goNextEvent : undefined}
          onPrevEvent={overlay.itemIndex > 0 ? goPrevEvent : undefined}
          topBarLeft={
            activeImages.length > 1 ? (
              <span className="text-white/80 text-sm font-medium tabular-nums">
                {overlay.imageIndex + 1} / {activeImages.length}
              </span>
            ) : undefined
          }
          bottomBar={
            <PhotoBottomBar
              event={activeItem.event}
              onCommentClick={() => setCommentsEvent(activeItem.event)}
              commentsEvent={commentsEvent}
              onCommentsClose={() => setCommentsEvent(null)}
            />
          }
        />
      )}
    </>
  );
}

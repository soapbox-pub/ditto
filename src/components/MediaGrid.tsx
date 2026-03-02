/**
 * MediaGrid — generic 3-column square-thumbnail grid for Nostr media events.
 *
 * All images across all events are flattened into a single array so the
 * Lightbox swipe just moves through them in order with no special-casing.
 */

import { useState, useMemo } from 'react';
import { Images } from 'lucide-react';
import { Blurhash } from 'react-blurhash';
import type { NostrEvent } from '@nostrify/nostrify';
import { Skeleton } from '@/components/ui/skeleton';
import { Lightbox } from '@/components/ImageGallery';
import { PhotoBottomBar } from '@/components/PhotoBottomBar';
import { cn } from '@/lib/utils';

// ── Media extraction ──────────────────────────────────────────────────────────

export interface MediaItem {
  url: string;
  blurhash?: string;
  alt?: string;
  allUrls: string[];
  event: NostrEvent;
  hasMultiple: boolean;
}

function parseImeta(tags: string[][]): { url: string; blurhash?: string; alt?: string }[] {
  const results: { url: string; blurhash?: string; alt?: string }[] = [];
  for (const tag of tags) {
    if (tag[0] !== 'imeta') continue;
    const parts: Record<string, string> = {};
    for (let i = 1; i < tag.length; i++) {
      const sp = tag[i].indexOf(' ');
      if (sp !== -1) parts[tag[i].slice(0, sp)] = tag[i].slice(sp + 1);
    }
    if (parts.url) results.push({ url: parts.url, blurhash: parts.blurhash, alt: parts.alt });
  }
  return results;
}

function extractImageUrls(content: string): string[] {
  return content.match(/https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp|svg)(\?[^\s]*)?/gi) ?? [];
}

export function eventToMediaItem(event: NostrEvent): MediaItem | null {
  const imeta = parseImeta(event.tags);
  if (imeta.length > 0) {
    return {
      url: imeta[0].url,
      blurhash: imeta[0].blurhash,
      alt: imeta[0].alt,
      allUrls: imeta.map((e) => e.url),
      event,
      hasMultiple: imeta.length > 1,
    };
  }
  if (event.kind === 1) {
    const urls = extractImageUrls(event.content);
    if (urls.length > 0) {
      return { url: urls[0], allUrls: urls, event, hasMultiple: urls.length > 1 };
    }
  }
  return null;
}

// ── Flat entry — one per image URL across all events ─────────────────────────

interface FlatEntry {
  url: string;
  event: NostrEvent;
  /** 0-based index of this image within its event */
  indexInEvent: number;
  /** total images in this event */
  countInEvent: number;
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

// ── MediaGrid ─────────────────────────────────────────────────────────────────

interface MediaGridProps {
  events: NostrEvent[];
  className?: string;
}

export function MediaGrid({ events, className }: MediaGridProps) {
  const items = useMemo(
    () => events.map(eventToMediaItem).filter((x): x is MediaItem => x !== null),
    [events],
  );

  // Flat list of every image URL in order, each paired with its source event.
  // This is what the Lightbox receives — swipe just advances the flat index.
  const flat = useMemo<FlatEntry[]>(
    () => items.flatMap((item) =>
      item.allUrls.map((url, indexInEvent) => ({
        url,
        event: item.event,
        indexInEvent,
        countInEvent: item.allUrls.length,
      })),
    ),
    [items],
  );

  // Map from item index → flat index of its first image, for grid tap.
  const itemStartIndex = useMemo(() => {
    const starts: number[] = [];
    let cursor = 0;
    for (const item of items) {
      starts.push(cursor);
      cursor += item.allUrls.length;
    }
    return starts;
  }, [items]);

  const [flatIndex, setFlatIndex] = useState<number | null>(null);
  const [commentsEvent, setCommentsEvent] = useState<NostrEvent | null>(null);

  const activeEntry = flatIndex !== null ? flat[flatIndex] : null;

  if (items.length === 0) return null;

  return (
    <>
      <div className={cn('grid grid-cols-3 gap-0.5', className)}>
        {items.map((item, i) => (
          <MediaThumb
            key={item.event.id}
            item={item}
            onClick={() => setFlatIndex(itemStartIndex[i])}
          />
        ))}
      </div>

      {flatIndex !== null && activeEntry && (
        <Lightbox
          images={flat.map((e) => e.url)}
          currentIndex={flatIndex}
          onClose={() => setFlatIndex(null)}
          onNext={() => setFlatIndex((i) => (i !== null ? Math.min(i + 1, flat.length - 1) : null))}
          onPrev={() => setFlatIndex((i) => (i !== null ? Math.max(i - 1, 0) : null))}
          topBarLeft={
            activeEntry.countInEvent > 1 ? (
              <span className="text-white/80 text-sm font-medium tabular-nums">
                {activeEntry.indexInEvent + 1} / {activeEntry.countInEvent}
              </span>
            ) : <span />
          }
          bottomBar={
            <PhotoBottomBar
              event={activeEntry.event}
              onCommentClick={() => setCommentsEvent(activeEntry.event)}
              commentsEvent={commentsEvent}
              onCommentsClose={() => setCommentsEvent(null)}
            />
          }
        />
      )}
    </>
  );
}

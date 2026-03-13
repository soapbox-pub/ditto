/**
 * MediaGrid — justified row-based collage for Nostr media events (Google Photos style).
 * Supports images, video, and audio. Images respect their aspect ratios from imeta `dim` tags.
 * All media across all events is flattened into one array so the Lightbox strip swipe
 * just advances through them in order.
 */

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Images, Play } from 'lucide-react';
import { Blurhash } from 'react-blurhash';
import type { NostrEvent } from '@nostrify/nostrify';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Lightbox, LOADING_SENTINEL } from '@/components/ImageGallery';
import { PhotoBottomBar } from '@/components/PhotoBottomBar';
import { useAuthor } from '@/hooks/useAuthor';
import { genUserName } from '@/lib/genUserName';
import { cn } from '@/lib/utils';

// ── Media type detection ──────────────────────────────────────────────────────

export type MediaType = 'image' | 'video' | 'audio';

function detectType(url: string, mime?: string): MediaType {
  if (mime) {
    if (mime.startsWith('video/')) return 'video';
    if (mime.startsWith('audio/')) return 'audio';
    if (mime.startsWith('image/')) return 'image';
  }
  if (/\.(mp4|webm|mov|m3u8)(\?.*)?$/i.test(url)) return 'video';
  if (/\.(mp3|ogg|flac|wav|aac|opus)(\?.*)?$/i.test(url)) return 'audio';
  return 'image';
}

// ── Aspect ratio helpers ──────────────────────────────────────────────────────

/** Default aspect ratio when dim tag is missing or unparseable. */
const DEFAULT_ASPECT_RATIO = 1;

/** Parse a dim string like "1280x720" into a width/height aspect ratio number. */
export function parseDimToAspectRatio(dim?: string): number {
  if (!dim) return DEFAULT_ASPECT_RATIO;
  const match = dim.match(/^(\d+)x(\d+)$/);
  if (!match) return DEFAULT_ASPECT_RATIO;
  const w = parseInt(match[1], 10);
  const h = parseInt(match[2], 10);
  if (!w || !h) return DEFAULT_ASPECT_RATIO;
  return w / h;
}

/** A row of items in the justified layout. */
interface JustifiedRow<T> {
  items: T[];
  /** The height of this row as a fraction of containerWidth. */
  heightFraction: number;
}

/**
 * Compute a justified (Google Photos–style) row layout.
 * Packs items into rows so each row fills the container width.
 * Each item's width in the row is proportional to its aspect ratio.
 *
 * @param items - Items with aspect ratios.
 * @param getAspectRatio - Function to extract aspect ratio from an item.
 * @param targetRowHeight - Ideal row height as a fraction of container width (e.g. 0.3 = 30% of width).
 * @param maxRowItems - Maximum items per row.
 */
function justifiedLayout<T>(
  items: T[],
  getAspectRatio: (item: T) => number,
  targetRowHeight: number = 0.3,
  maxRowItems: number = 5,
): JustifiedRow<T>[] {
  if (items.length === 0) return [];

  const rows: JustifiedRow<T>[] = [];
  let currentRow: T[] = [];
  let currentAspectSum = 0;

  for (const item of items) {
    const ar = getAspectRatio(item);
    currentRow.push(item);
    currentAspectSum += ar;

    // The row height (as fraction of container width) = 1 / sum(aspect ratios)
    const rowHeightFraction = 1 / currentAspectSum;

    // If row is full enough (height is at or below target) or max items reached, finalize it
    if (rowHeightFraction <= targetRowHeight || currentRow.length >= maxRowItems) {
      rows.push({ items: [...currentRow], heightFraction: rowHeightFraction });
      currentRow = [];
      currentAspectSum = 0;
    }
  }

  // Handle remaining items in the last incomplete row
  if (currentRow.length > 0) {
    const rowHeightFraction = 1 / currentAspectSum;
    // Cap the last row height to target so items don't get too large
    rows.push({
      items: currentRow,
      heightFraction: Math.min(rowHeightFraction, targetRowHeight),
    });
  }

  return rows;
}

// ── Media extraction ──────────────────────────────────────────────────────────

export interface MediaItem {
  url: string;
  type: MediaType;
  blurhash?: string;
  dim?: string;
  alt?: string;
  mime?: string;
  allUrls: string[];
  allTypes: MediaType[];
  allDims: (string | undefined)[];
  event: NostrEvent;
  hasMultiple: boolean;
}

function parseImeta(tags: string[][]): { url: string; blurhash?: string; dim?: string; alt?: string; mime?: string }[] {
  const results: { url: string; blurhash?: string; dim?: string; alt?: string; mime?: string }[] = [];
  for (const tag of tags) {
    if (tag[0] !== 'imeta') continue;
    const parts: Record<string, string> = {};
    for (let i = 1; i < tag.length; i++) {
      const sp = tag[i].indexOf(' ');
      if (sp !== -1) parts[tag[i].slice(0, sp)] = tag[i].slice(sp + 1);
    }
    if (parts.url) results.push({ url: parts.url, blurhash: parts.blurhash, dim: parts.dim, alt: parts.alt, mime: parts.m });
  }
  return results;
}

function extractMediaUrls(content: string): string[] {
  return content.match(/https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp|svg|mp4|webm|mov|mp3|ogg|flac|wav|aac|opus)(\?[^\s]*)?/gi) ?? [];
}

export function eventToMediaItem(event: NostrEvent): MediaItem | null {
  const imeta = parseImeta(event.tags);
  if (imeta.length > 0) {
    const first = imeta[0];
    const firstType = detectType(first.url, first.mime);
    return {
      url: first.url,
      type: firstType,
      blurhash: first.blurhash,
      dim: first.dim,
      alt: first.alt,
      mime: first.mime,
      allUrls: imeta.map((e) => e.url),
      allTypes: imeta.map((e) => detectType(e.url, e.mime)),
      allDims: imeta.map((e) => e.dim),
      event,
      hasMultiple: imeta.length > 1,
    };
  }
  if (event.kind === 1) {
    const urls = extractMediaUrls(event.content);
    if (urls.length > 0) {
      const types = urls.map((u) => detectType(u));
      return {
        url: urls[0],
        type: types[0],
        allUrls: urls,
        allTypes: types,
        allDims: urls.map(() => undefined),
        event,
        hasMultiple: urls.length > 1,
      };
    }
  }
  return null;
}

// ── Flat entry — one per media URL across all events ─────────────────────────

interface FlatEntry {
  url: string;
  type: MediaType;
  mime?: string;
  dim?: string;
  blurhash?: string;
  pubkey: string;
  event: NostrEvent;
  indexInEvent: number;
  countInEvent: number;
}

// ── Audio thumbnail — idle visualizer with author avatar ──────────────────────

function AudioThumb({ pubkey }: { pubkey: string }) {
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
  const name = metadata?.name ?? genUserName(pubkey);

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary/20 via-background/40 to-primary/5">
      {/* Idle sine-wave rings */}
      <div className="absolute inset-0 flex items-center justify-center opacity-20">
        <div className="size-24 rounded-full border border-primary animate-ping" style={{ animationDuration: '3s' }} />
        <div className="absolute size-16 rounded-full border border-primary animate-ping" style={{ animationDuration: '2.3s', animationDelay: '0.5s' }} />
      </div>
      <Avatar className="size-12 relative ring-2 ring-primary/40">
        <AvatarImage src={metadata?.picture} alt={name} />
        <AvatarFallback className="text-base">{name[0]?.toUpperCase()}</AvatarFallback>
      </Avatar>
    </div>
  );
}

// ── Grid thumbnail ────────────────────────────────────────────────────────────

function MediaThumb({ item, onClick }: { item: MediaItem; onClick: () => void }) {
  const [loaded, setLoaded] = useState(false);

  return (
    <button
      className="relative overflow-hidden bg-muted group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary w-full h-full"
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
      {!item.blurhash && !loaded && item.type !== 'audio' && (
        <Skeleton className="absolute inset-0 w-full h-full rounded-none" />
      )}

      {item.type === 'video' && (
        <video
          src={item.url}
          className={cn('absolute inset-0 w-full h-full object-cover transition-opacity duration-300 group-hover:scale-[1.04]', loaded ? 'opacity-100' : 'opacity-0')}
          muted
          autoPlay
          loop
          playsInline
          preload="metadata"
          onLoadedData={() => setLoaded(true)}
        />
      )}
      {item.type === 'image' && (
        <img
          src={item.url}
          alt={item.alt ?? ''}
          className={cn('absolute inset-0 w-full h-full object-cover transition-all duration-300 group-hover:scale-[1.04]', loaded ? 'opacity-100' : 'opacity-0')}
          loading="lazy"
          onLoad={() => setLoaded(true)}
        />
      )}
      {item.type === 'audio' && (
        <AudioThumb pubkey={item.event.pubkey} />
      )}

      {/* Play badge for video */}
      {item.type === 'video' && (
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="bg-black/50 rounded-full p-2">
            <Play className="size-5 text-white fill-white" />
          </div>
        </div>
      )}

      {item.hasMultiple && item.type === 'image' && (
        <div className="absolute top-1.5 right-1.5 bg-black/60 text-white rounded p-0.5">
          <Images className="size-3.5" />
        </div>
      )}
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/15 transition-colors duration-200" />
    </button>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

/** Pre-defined aspect ratios for skeleton rows to approximate a collage. */
const SKELETON_ROWS = [
  [1.5, 0.8, 1.2],
  [1, 1.3, 0.9],
  [0.75, 1.5, 1],
  [1.2, 1, 1.3],
  [1, 0.8, 1.5],
];

export function MediaGridSkeleton({ count = 15 }: { count?: number }) {
  const rowCount = Math.ceil(count / 3);
  return (
    <div className="flex flex-col gap-0.5">
      {Array.from({ length: rowCount }).map((_, rowIdx) => {
        const ratios = SKELETON_ROWS[rowIdx % SKELETON_ROWS.length];
        return (
          <div key={rowIdx} className="flex gap-0.5">
            {ratios.map((ar, colIdx) => {
              const itemIdx = rowIdx * 3 + colIdx;
              if (itemIdx >= count) return null;
              return (
                <Skeleton
                  key={colIdx}
                  className="rounded-none"
                  style={{
                    flexGrow: ar,
                    flexBasis: 0,
                    aspectRatio: `${ar}`,
                  }}
                />
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ── MediaGrid ─────────────────────────────────────────────────────────────────

interface MediaGridProps {
  events: NostrEvent[];
  className?: string;
  /** If set, the lightbox opens at this URL on mount (used by sidebar click). */
  initialOpenUrl?: string;
  onInitialOpenConsumed?: () => void;
  /** Called when the lightbox reaches the last item — use to trigger pagination. */
  onNearEnd?: () => void;
  /** Whether there are more pages to load — keeps the lightbox swipeable past the last item. */
  hasNextPage?: boolean;
  /** Whether a next page is currently being fetched — shown as a spinner slot. */
  isFetchingNextPage?: boolean;
}

export function MediaGrid({ events, className, initialOpenUrl, onInitialOpenConsumed, onNearEnd, hasNextPage }: MediaGridProps) {
  const items = useMemo(
    () => events.map(eventToMediaItem).filter((x): x is MediaItem => x !== null),
    [events],
  );

  const flat = useMemo<FlatEntry[]>(
    () => items.flatMap((item) =>
      item.allUrls.map((url, indexInEvent) => ({
        url,
        type: item.allTypes[indexInEvent] ?? item.type,
        mime: item.mime,
        dim: item.allDims[indexInEvent] ?? item.dim,
        blurhash: item.blurhash,
        pubkey: item.event.pubkey,
        event: item.event,
        indexInEvent,
        countInEvent: item.allUrls.length,
      })),
    ),
    [items],
  );

  const itemStartIndex = useMemo(() => {
    const starts: number[] = [];
    let cursor = 0;
    for (const item of items) {
      starts.push(cursor);
      cursor += item.allUrls.length;
    }
    return starts;
  }, [items]);

  // Compute justified row layout
  const rows = useMemo(
    () => justifiedLayout(
      items.map((item, i) => ({ item, index: i })),
      ({ item }) => parseDimToAspectRatio(item.dim),
      0.3,
      5,
    ),
    [items],
  );

  // Open at initialOpenUrl if provided
  const initialIndex = useMemo(() => {
    if (!initialOpenUrl) return null;
    const idx = flat.findIndex((e) => e.url === initialOpenUrl);
    return idx >= 0 ? idx : null;
  }, [flat, initialOpenUrl]);

  const [flatIndex, setFlatIndex] = useState<number | null>(initialIndex);

  // Sync flatIndex when initialOpenUrl changes while the component is already mounted
  // (e.g., sidebar click while media tab is already the active tab).
  useEffect(() => {
    if (initialIndex !== null) {
      setFlatIndex(initialIndex);
    }
  }, [initialIndex]);

  const activeEntry = flatIndex !== null ? flat[flatIndex] : null;

  // Append a loading sentinel when there are more pages so the lightbox
  // stays swipeable past the last real item.
  const images = useMemo(() => {
    const urls = flat.map((e) => e.url);
    if (hasNextPage) urls.push(LOADING_SENTINEL);
    return urls;
  }, [flat, hasNextPage]);

  const mediaTypes = useMemo(() => flat.map((e) => e.type as 'image' | 'video' | 'audio'), [flat]);
  const mediaMeta = useMemo(() => flat.map((e) => ({ mime: e.mime, dim: e.dim, blurhash: e.blurhash, pubkey: e.pubkey })), [flat]);

  // When flat grows (new page loaded) while parked on the sentinel, auto-advance.
  const waitingForMore = useRef(false);
  const prevFlatLength = useRef(flat.length);
  useEffect(() => {
    const prev = prevFlatLength.current;
    prevFlatLength.current = flat.length;
    if (waitingForMore.current && flat.length > prev && flatIndex !== null) {
      waitingForMore.current = false;
      setFlatIndex(flatIndex + 1);
    }
  }, [flat.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleNext = useCallback(() => {
    setFlatIndex((i) => {
      if (i === null) return null;
      if (i >= flat.length - 1) {
        // At or past the last real item — trigger fetch and park on sentinel
        waitingForMore.current = true;
        onNearEnd?.();
        return i; // stay; sentinel is already in images array
      }
      const next = i + 1;
      if (next >= flat.length - 1) onNearEnd?.();
      return next;
    });
  }, [flat.length, onNearEnd]);

  if (items.length === 0) return null;

  return (
    <>
      <div className={cn('flex flex-col gap-0.5', className)}>
        {rows.map((row, rowIdx) => (
          <div key={rowIdx} className="flex gap-0.5">
            {row.items.map(({ item, index }) => {
              const ar = parseDimToAspectRatio(item.dim);
              return (
                <div
                  key={item.event.id}
                  className="relative"
                  style={{
                    flexGrow: ar,
                    flexBasis: 0,
                    aspectRatio: `${ar}`,
                  }}
                >
                  <MediaThumb
                    item={item}
                    onClick={() => setFlatIndex(itemStartIndex[index])}
                  />
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {flatIndex !== null && (
        <Lightbox
          images={images}
          mediaTypes={mediaTypes}
          mediaMeta={mediaMeta}
          currentIndex={flatIndex}
          onClose={() => { setFlatIndex(null); onInitialOpenConsumed?.(); waitingForMore.current = false; }}
          onNext={handleNext}
          onPrev={() => setFlatIndex((i) => (i !== null ? Math.max(i - 1, 0) : null))}
          topBarLeft={
            activeEntry && activeEntry.countInEvent > 1 ? (
              <span className="text-white/80 text-sm font-medium tabular-nums">
                {activeEntry.indexInEvent + 1} / {activeEntry.countInEvent}
              </span>
            ) : <span />
          }
          bottomBar={activeEntry ? <PhotoBottomBar event={activeEntry.event} /> : undefined}
        />
      )}
    </>
  );
}

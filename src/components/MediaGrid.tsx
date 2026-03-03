/**
 * MediaGrid — generic 3-column square-thumbnail grid for Nostr media events.
 * Supports images, video, and audio. All media across all events is flattened
 * into one array so the Lightbox strip swipe just advances through them in order.
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

export function MediaGrid({ events, className, initialOpenUrl, onInitialOpenConsumed, onNearEnd, hasNextPage, isFetchingNextPage }: MediaGridProps) {
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
        dim: item.dim,
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

  // Open at initialOpenUrl if provided
  const initialIndex = useMemo(() => {
    if (!initialOpenUrl) return null;
    const idx = flat.findIndex((e) => e.url === initialOpenUrl);
    return idx >= 0 ? idx : null;
  }, [flat, initialOpenUrl]);

  const [flatIndex, setFlatIndex] = useState<number | null>(initialIndex);

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
      <div className={cn('grid grid-cols-3 gap-0.5', className)}>
        {items.map((item, i) => (
          <MediaThumb
            key={item.event.id}
            item={item}
            onClick={() => setFlatIndex(itemStartIndex[i])}
          />
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

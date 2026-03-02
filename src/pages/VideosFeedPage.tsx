/**
 * VideosFeedPage — YouTube-style vertical video feed.
 *
 * Layout (top to bottom):
 *  ┌─ Follows | Global tabs ──────────────────────────┐
 *  ├─ Live Now strip (horizontal, compact) ────────────┤
 *  ├─ Video card (thumbnail + title + author + time) ──┤
 *  ├─ Video card ...                                   │
 *  └───────────────────────────────────────────────────┘
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Film, Radio, Play, Clock, Eye, Tv2 } from 'lucide-react';
import { useSeoMeta } from '@unhead/react';
import { nip19 } from 'nostr-tools';
import { Blurhash } from 'react-blurhash';
import type { NostrEvent } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { useFollowList } from '@/hooks/useFollowActions';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAuthor } from '@/hooks/useAuthor';
import { useLayoutOptions } from '@/contexts/LayoutContext';
import { useOpenPost } from '@/hooks/useOpenPost';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { useFeed } from '@/hooks/useFeed';
import { useInfiniteHotFeed } from '@/hooks/useTrending';
import { useMuteList } from '@/hooks/useMuteList';
import { isEventMuted } from '@/lib/muteHelpers';
import { getDisplayName } from '@/lib/getDisplayName';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { KindInfoButton } from '@/components/KindInfoButton';
import { sidebarItemIcon } from '@/lib/sidebarItems';
import { getExtraKindDef } from '@/lib/extraKinds';
import { timeAgo } from '@/lib/timeAgo';
import { cn } from '@/lib/utils';
import type { FeedItem } from '@/lib/feedUtils';

// Reuse the real VineCard — no re-implementation
import { VineCard } from '@/pages/VinesFeedPage';

const videosDef = getExtraKindDef('videos')!;

/** Items per page for video feeds. */
const VIDEO_PAGE_SIZE = 20;

type FeedTab = 'follows' | 'global';

// ── Helpers ───────────────────────────────────────────────────────────────────

function getTag(tags: string[][], name: string): string | undefined {
  return tags.find(([n]) => n === name)?.[1];
}

function parseVideoImeta(tags: string[][]): { url?: string; thumbnail?: string; duration?: string; blurhash?: string } {
  const standaloneThumb = getTag(tags, 'thumb') ?? getTag(tags, 'image');

  for (const tag of tags) {
    if (tag[0] !== 'imeta') continue;
    const parts: Record<string, string> = {};
    for (let i = 1; i < tag.length; i++) {
      const p = tag[i];
      const sp = p.indexOf(' ');
      if (sp !== -1) parts[p.slice(0, sp)] = p.slice(sp + 1);
    }
    if (parts.url) {
      return {
        url: parts.url,
        thumbnail: parts.image ?? parts.thumb ?? standaloneThumb,
        duration: parts.duration,
        blurhash: parts.blurhash,
      };
    }
  }
  return { url: getTag(tags, 'url'), thumbnail: standaloneThumb };
}

function fmtDuration(s: string | undefined): string | undefined {
  const n = parseFloat(s ?? '');
  if (isNaN(n) || n <= 0) return undefined;
  const h = Math.floor(n / 3600), m = Math.floor((n % 3600) / 60), sec = Math.floor(n % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

// ── Tab button ────────────────────────────────────────────────────────────────

function TabButton({ label, active, onClick, disabled }: {
  label: string; active: boolean; onClick: () => void; disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex-1 py-3.5 text-center text-sm font-medium transition-colors relative hover:bg-secondary/40 disabled:opacity-50',
        active ? 'text-foreground' : 'text-muted-foreground',
      )}
    >
      {label}
      {active && <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-16 h-1 bg-primary rounded-full" />}
    </button>
  );
}

// ── Author chip (inline, for video card row) ──────────────────────────────────

function CardAuthor({ pubkey }: { pubkey: string }) {
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
  const displayName = getDisplayName(metadata, pubkey);
  const profileUrl = useProfileUrl(pubkey, metadata);

  if (author.isLoading) {
    return (
      <div className="flex items-center gap-2">
        <Skeleton className="size-8 rounded-full shrink-0" />
        <Skeleton className="h-3 w-28" />
      </div>
    );
  }

  return (
    <Link to={profileUrl} className="flex items-center gap-2 group/a min-w-0" onClick={(e) => e.stopPropagation()}>
      <Avatar className="size-8 shrink-0">
        <AvatarImage src={metadata?.picture} alt={displayName} />
        <AvatarFallback className="bg-primary/20 text-primary text-xs">{displayName[0]?.toUpperCase()}</AvatarFallback>
      </Avatar>
      <span className="text-sm text-muted-foreground group-hover/a:text-foreground transition-colors truncate">{displayName}</span>
    </Link>
  );
}

// ── Main video card (YouTube-style, stacked vertically) ───────────────────────

function VideoCard({ event }: { event: NostrEvent }) {
  const { thumbnail, duration, blurhash } = parseVideoImeta(event.tags);
  const title = getTag(event.tags, 'title') ?? (event.content.slice(0, 120) || 'Untitled');
  const dur = fmtDuration(duration);
  const isShort = event.kind === 22;
  const [imgLoaded, setImgLoaded] = useState(false);

  const noteId = nip19.noteEncode(event.id);
  const { onClick, onAuxClick } = useOpenPost(`/${noteId}`);

  return (
    <div
      className="cursor-pointer group"
      onClick={onClick}
      onAuxClick={onAuxClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
    >
      {/* Thumbnail */}
      <div className={cn(
        'relative overflow-hidden rounded-xl bg-muted',
        isShort ? 'aspect-[9/16] max-w-[220px]' : 'aspect-video w-full',
      )}>
        {blurhash && (
          <Blurhash
            hash={blurhash}
            width="100%"
            height="100%"
            resolutionX={32}
            resolutionY={32}
            punch={1}
            className={cn('absolute inset-0 transition-opacity duration-300', imgLoaded ? 'opacity-0' : 'opacity-100')}
            style={{ width: '100%', height: '100%' }}
          />
        )}
        {thumbnail ? (
          <img
            src={thumbnail}
            alt={title}
            className={cn(
              'absolute inset-0 w-full h-full object-cover transition-all duration-300 group-hover:scale-[1.03]',
              imgLoaded ? 'opacity-100' : 'opacity-0',
            )}
            loading="lazy"
            onLoad={() => setImgLoaded(true)}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Play className="size-10 text-muted-foreground/30" />
          </div>
        )}

        {/* Play overlay on hover */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20">
          <div className="size-14 rounded-full bg-black/60 flex items-center justify-center">
            <Play className="size-7 text-white fill-white ml-0.5" />
          </div>
        </div>

        {/* Duration badge */}
        {dur && (
          <div className="absolute bottom-2 right-2 bg-black/80 text-white text-xs px-1.5 py-0.5 rounded font-medium pointer-events-none">
            {dur}
          </div>
        )}

        {/* Short badge */}
        {isShort && (
          <div className="absolute top-2 left-2">
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-medium">Short</Badge>
          </div>
        )}
      </div>

      {/* Info row */}
      <div className="mt-3 flex gap-3">
        {/* Author avatar (large, left column like YouTube) */}
        <AuthorAvatarOnly pubkey={event.pubkey} />

        {/* Title + meta */}
        <div className="flex-1 min-w-0 space-y-1">
          <h3 className="text-sm font-semibold leading-snug line-clamp-2 group-hover:text-primary transition-colors">
            {title}
          </h3>
          <AuthorNameOnly pubkey={event.pubkey} />
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="size-3 shrink-0" />
            {timeAgo(event.created_at)}
          </p>
        </div>
      </div>
    </div>
  );
}

/** Just the avatar circle for the YouTube-style left column. */
function AuthorAvatarOnly({ pubkey }: { pubkey: string }) {
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
  const displayName = getDisplayName(metadata, pubkey);
  const profileUrl = useProfileUrl(pubkey, metadata);

  if (author.isLoading) return <Skeleton className="size-9 rounded-full shrink-0 mt-0.5" />;

  return (
    <Link to={profileUrl} className="shrink-0 mt-0.5" onClick={(e) => e.stopPropagation()}>
      <Avatar className="size-9">
        <AvatarImage src={metadata?.picture} alt={displayName} />
        <AvatarFallback className="bg-primary/20 text-primary text-xs">{displayName[0]?.toUpperCase()}</AvatarFallback>
      </Avatar>
    </Link>
  );
}

/** Just the author name line. */
function AuthorNameOnly({ pubkey }: { pubkey: string }) {
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
  const displayName = getDisplayName(metadata, pubkey);
  const profileUrl = useProfileUrl(pubkey, metadata);

  if (author.isLoading) return <Skeleton className="h-3 w-24" />;

  return (
    <Link
      to={profileUrl}
      className="text-xs text-muted-foreground hover:text-foreground transition-colors truncate block"
      onClick={(e) => e.stopPropagation()}
    >
      {displayName}
    </Link>
  );
}

function VideoCardSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="w-full aspect-video rounded-xl" />
      <div className="flex gap-3">
        <Skeleton className="size-9 rounded-full shrink-0 mt-0.5" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
    </div>
  );
}

// ── Live streams — horizontal compact shelf ───────────────────────────────────

function useLiveStreams(tab: FeedTab) {
  const { nostr } = useNostr();
  const { data: followData } = useFollowList();
  const followedPubkeys = followData?.pubkeys ?? [];

  return useQuery<NostrEvent[]>({
    queryKey: ['live-streams', tab, followedPubkeys.join(',')],
    queryFn: async ({ signal }) => {
      const base: Record<string, unknown> = { kinds: [30311], '#status': ['live'], limit: 10 };
      if (tab === 'follows' && followedPubkeys.length > 0) {
        base.authors = followedPubkeys;
      }
      const events = await nostr.query(
        [base as { kinds: number[]; limit: number }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) },
      );
      return events.filter((e) => getTag(e.tags, 'status') === 'live');
    },
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });
}

function LiveStreamChip({ event }: { event: NostrEvent }) {
  const title = getTag(event.tags, 'title') || 'Untitled Stream';
  const imageUrl = getTag(event.tags, 'image');
  const viewers = getTag(event.tags, 'current_participants');

  const naddrId = useMemo(() => {
    const d = getTag(event.tags, 'd') || '';
    return nip19.naddrEncode({ kind: event.kind, pubkey: event.pubkey, identifier: d });
  }, [event]);

  const { onClick, onAuxClick } = useOpenPost(`/${naddrId}`);
  const author = useAuthor(event.pubkey);
  const meta = author.data?.metadata;
  const displayName = getDisplayName(meta, event.pubkey);

  return (
    <div
      className="cursor-pointer group shrink-0 w-44"
      onClick={onClick}
      onAuxClick={onAuxClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
    >
      <div className="relative aspect-video overflow-hidden rounded-lg bg-muted">
        {imageUrl ? (
          <img src={imageUrl} alt={title} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-red-950/40 to-muted">
            <Tv2 className="size-5 text-red-400/60" />
          </div>
        )}
        <div className="absolute top-1.5 left-1.5">
          <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-red-600 text-white px-1.5 py-0.5 rounded">
            <span className="size-1.5 rounded-full bg-white animate-pulse" />
            LIVE
          </span>
        </div>
        {viewers && (
          <div className="absolute bottom-1.5 right-1.5 flex items-center gap-0.5 bg-black/70 text-white text-[10px] px-1 py-0.5 rounded">
            <Eye className="size-2.5" />{viewers}
          </div>
        )}
      </div>
      <p className="mt-1.5 text-xs font-medium line-clamp-1 group-hover:text-primary transition-colors">{title}</p>
      <p className="text-[11px] text-muted-foreground truncate">{displayName}</p>
    </div>
  );
}

function LiveStreamsStrip({ tab }: { tab: FeedTab }) {
  const { data: liveEvents = [] } = useLiveStreams(tab);
  if (liveEvents.length === 0) return null;

  return (
    <div className="px-4 pt-4 pb-5 border-b border-border">
      <div className="flex items-center gap-2 mb-3">
        <span className="size-2 rounded-full bg-red-500 animate-pulse shrink-0" />
        <h2 className="text-sm font-semibold">Live now</h2>
        <span className="text-xs text-muted-foreground">{liveEvents.length} stream{liveEvents.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        {liveEvents.map((e) => <LiveStreamChip key={e.id} event={e} />)}
      </div>
    </div>
  );
}

// ── Shorts player (full-screen snap, reuses VineCard) ─────────────────────────

function ShortsPlayer({
  events,
  startIndex,
  onClose,
}: {
  events: NostrEvent[];
  startIndex: number;
  onClose: () => void;
}) {
  const [activeIndex, setActiveIndex] = useState(startIndex);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.scrollTo({ top: startIndex * container.clientHeight, behavior: 'instant' });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
            const index = Array.from(container.children).indexOf(entry.target as Element);
            if (index !== -1) setActiveIndex(index);
          }
        }
      },
      { root: container, threshold: 0.5 },
    );
    Array.from(container.children).forEach((child) => observer.observe(child));
    return () => observer.disconnect();
  }, [events]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const container = containerRef.current;
      if (e.key === 'Escape') { onClose(); return; }
      if (!container) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = Math.min(activeIndex + 1, events.length - 1);
        container.scrollTo({ top: next * container.clientHeight, behavior: 'smooth' });
        setActiveIndex(next);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = Math.max(activeIndex - 1, 0);
        container.scrollTo({ top: prev * container.clientHeight, behavior: 'smooth' });
        setActiveIndex(prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, activeIndex, events.length]);

  return (
    <div className="flex-1 min-w-0 flex flex-col">
      <div className="flex border-b border-border sticky top-mobile-bar sidebar:top-0 bg-background/80 backdrop-blur-md z-10 shrink-0">
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 px-4 py-3.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-4" />
          Back to Videos
        </button>
      </div>
      <div
        ref={containerRef}
        className="vine-slide-height sidebar:h-[calc(100vh-3rem)] snap-y snap-mandatory overflow-y-scroll"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', overscrollBehavior: 'none' }}
      >
        {events.map((event, i) => (
          <div
            key={event.id}
            className="w-full vine-slide-height sidebar:h-[calc(100vh-3rem)] snap-start snap-always flex-shrink-0"
          >
            <VineCard
              event={event}
              isActive={i === activeIndex}
              isNearActive={Math.abs(i - activeIndex) <= 1}
              onCommentClick={() => {}}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function VideosFeedPage() {
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const { muteItems } = useMuteList();

  const [feedTab, setFeedTab] = useState<FeedTab>(user ? 'follows' : 'global');

  useSeoMeta({ title: `Videos | ${config.appName}`, description: 'Videos and live streams on Nostr' });
  useLayoutOptions({ showFAB: false });

  useEffect(() => { if (user) setFeedTab('follows'); }, [user]);

  // ── Follows: chronological ──
  const followsQuery = useFeed('follows', { kinds: [21, 22] });

  // ── Global: sort:hot ──
  const globalQuery = useInfiniteHotFeed([21, 22], feedTab === 'global', VIDEO_PAGE_SIZE);

  const activeQuery = feedTab === 'follows' ? followsQuery : globalQuery;
  const { data: rawData, isPending, isLoading } = activeQuery;

  const videoEvents = useMemo(() => {
    if (!rawData?.pages) return [];
    const seen = new Set<string>();

    const events: NostrEvent[] = feedTab === 'follows'
      ? (rawData.pages as unknown as { items: FeedItem[] }[]).flatMap((p) => p.items).map((item) => item.event)
      : (rawData.pages as unknown as NostrEvent[][]).flat();

    return events.filter((event) => {
      if (seen.has(event.id)) return false;
      seen.add(event.id);
      if (![21, 22].includes(event.kind)) return false;
      if (muteItems.length > 0 && isEventMuted(event, muteItems)) return false;
      return !!parseVideoImeta(event.tags).url;
    });
  }, [rawData?.pages, muteItems, feedTab]);

  // Shorts (kind 22) get their own player when tapped
  const shorts = useMemo(() => videoEvents.filter((e) => e.kind === 22), [videoEvents]);
  const [shortsPlayerIndex, setShortsPlayerIndex] = useState<number | null>(null);

  const showSkeleton = isPending || (isLoading && !rawData);

  // Shorts full-screen player
  if (shortsPlayerIndex !== null) {
    return (
      <ShortsPlayer
        events={shorts}
        startIndex={shortsPlayerIndex}
        onClose={() => setShortsPlayerIndex(null)}
      />
    );
  }

  return (
    <main>
      {/* ── Header ── */}
      <div className="flex items-center gap-4 px-4 mt-4 mb-1">
        <Link to="/" className="p-2 -ml-2 rounded-full hover:bg-secondary transition-colors sidebar:hidden">
          <ArrowLeft className="size-5" />
        </Link>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Film className="size-5" />
          <h1 className="text-xl font-bold">Videos</h1>
        </div>
        <KindInfoButton kindDef={videosDef} icon={sidebarItemIcon('videos', 'size-5')} />
      </div>

      {/* ── Tabs ── */}
      <div className="flex border-b border-border sticky top-mobile-bar sidebar:top-0 bg-background/80 backdrop-blur-md z-10">
        <TabButton label="Follows" active={feedTab === 'follows'} onClick={() => setFeedTab('follows')} disabled={!user} />
        <TabButton label="Global" active={feedTab === 'global'} onClick={() => setFeedTab('global')} />
      </div>

      {/* ── Live strip ── */}
      <LiveStreamsStrip tab={feedTab} />

      {/* ── Feed ── */}
      {showSkeleton ? (
        <div className="px-4 pt-5 pb-8 space-y-8">
          {Array.from({ length: 5 }).map((_, i) => (
            <VideoCardSkeleton key={i} />
          ))}
        </div>
      ) : videoEvents.length === 0 ? (
        <div className="py-16 px-8 text-center">
          <Radio className="size-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground">
            {feedTab === 'follows'
              ? 'No videos from people you follow yet. Try Global.'
              : 'No videos found. Check your relay connections or come back soon.'}
          </p>
          {feedTab === 'follows' && (
            <button
              className="mt-3 text-sm text-primary hover:underline"
              onClick={() => setFeedTab('global')}
            >
              Switch to Global
            </button>
          )}
        </div>
      ) : (
        <div className="px-4 pt-5 pb-8 space-y-8">
          {videoEvents.map((event) => {
            if (event.kind === 22) {
              // Shorts get a portrait card that opens the TikTok-style player
              const shortIndex = shorts.indexOf(event);
              return (
                <div
                  key={event.id}
                  className="cursor-pointer group flex gap-3"
                  onClick={() => setShortsPlayerIndex(shortIndex)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && setShortsPlayerIndex(shortIndex)}
                >
                  <ShortCardLeft event={event} />
                  <ShortCardRight event={event} />
                </div>
              );
            }
            return <VideoCard key={event.id} event={event} />;
          })}
        </div>
      )}
    </main>
  );
}

/** Portrait thumbnail (left column) for a short in the vertical feed. */
function ShortCardLeft({ event }: { event: NostrEvent }) {
  const { thumbnail, blurhash } = parseVideoImeta(event.tags);
  const title = getTag(event.tags, 'title') ?? 'Short';
  const [imgLoaded, setImgLoaded] = useState(false);

  return (
    <div className="relative w-[100px] aspect-[9/16] shrink-0 overflow-hidden rounded-xl bg-muted">
      {blurhash && (
        <Blurhash
          hash={blurhash}
          width="100%"
          height="100%"
          resolutionX={32}
          resolutionY={32}
          punch={1}
          className={cn('absolute inset-0 transition-opacity duration-300', imgLoaded ? 'opacity-0' : 'opacity-100')}
          style={{ width: '100%', height: '100%' }}
        />
      )}
      {thumbnail ? (
        <img
          src={thumbnail}
          alt={title}
          className={cn('absolute inset-0 w-full h-full object-cover transition-all duration-300 group-hover:scale-[1.03]', imgLoaded ? 'opacity-100' : 'opacity-0')}
          loading="lazy"
          onLoad={() => setImgLoaded(true)}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <Play className="size-6 text-muted-foreground/30" />
        </div>
      )}
      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20">
        <div className="size-10 rounded-full bg-black/60 flex items-center justify-center">
          <Play className="size-5 text-white fill-white ml-0.5" />
        </div>
      </div>
      <div className="absolute top-1.5 left-1.5">
        <Badge variant="secondary" className="text-[9px] px-1 py-0 font-medium leading-4">Short</Badge>
      </div>
    </div>
  );
}

/** Text info (right column) for a short in the vertical feed. */
function ShortCardRight({ event }: { event: NostrEvent }) {
  const title = getTag(event.tags, 'title') ?? (event.content.slice(0, 80) || 'Short');

  return (
    <div className="flex-1 min-w-0 space-y-2 pt-1">
      <h3 className="text-sm font-semibold leading-snug line-clamp-3 group-hover:text-primary transition-colors">
        {title}
      </h3>
      <CardAuthor pubkey={event.pubkey} />
      <p className="text-xs text-muted-foreground flex items-center gap-1">
        <Clock className="size-3 shrink-0" />
        {timeAgo(event.created_at)}
      </p>
    </div>
  );
}

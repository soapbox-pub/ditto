/**
 * VideosFeedPage — unified video + stream feed.
 *
 *  ┌─ Follows | Global tabs ─────────────────────┐
 *  ├─ Live Now horizontal strip (live-only) ──────┤
 *  ├─ Videos (kind 21) grid ──────────────────────┤
 *  ├─ Shorts (kind 22) — inline snap-scroll ──────┤
 *  │  (exactly like VinesFeedPage, within column) │
 *  └──────────────────────────────────────────────┘
 *
 * Global: sort:hot (ditto relay, limit 8/page)
 * Follows: chronological (useFeed, limit 8/page via PAGE_SIZE override)
 * Streams: live-only query, limit 10
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Film, Radio, Play, Clock, Eye } from 'lucide-react';
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

/** Items per page for video feeds — enough to fill the horizontal row with overflow. */
const VIDEO_PAGE_SIZE = 12;

type FeedTab = 'follows' | 'global';

// ── Helpers ───────────────────────────────────────────────────────────────────

function getTag(tags: string[][], name: string): string | undefined {
  return tags.find(([n]) => n === name)?.[1];
}

function parseVideoImeta(tags: string[][]): { url?: string; thumbnail?: string; duration?: string; blurhash?: string } {
  // Standalone fallback tags (checked after imeta)
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
        // imeta uses "image" key for thumbnail; fall back to standalone tags
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

// ── Author chip ───────────────────────────────────────────────────────────────

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

// ── Video grid card (kind 21) ─────────────────────────────────────────────────

function VideoGridCard({ event }: { event: NostrEvent }) {
  const { thumbnail, duration, blurhash } = parseVideoImeta(event.tags);
  const title = getTag(event.tags, 'title') ?? (event.content.slice(0, 120) || 'Untitled');
  const dur = fmtDuration(duration);
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
      <div className="relative aspect-video overflow-hidden rounded-xl bg-muted">
        {blurhash && !imgLoaded && (
          <Blurhash hash={blurhash} width="100%" height="100%" resolutionX={32} resolutionY={32} punch={1}
            className="absolute inset-0" style={{ width: '100%', height: '100%' }} />
        )}
        {thumbnail ? (
          <img
            src={thumbnail}
            alt={title}
            className={cn('w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]', imgLoaded ? 'opacity-100' : 'opacity-0')}
            loading="lazy"
            onLoad={() => setImgLoaded(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Play className="size-10 text-muted-foreground/30" />
          </div>
        )}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/25">
          <div className="size-14 rounded-full bg-black/60 flex items-center justify-center">
            <Play className="size-7 text-white fill-white ml-0.5" />
          </div>
        </div>
        {dur && (
          <div className="absolute bottom-2 right-2 bg-black/80 text-white text-xs px-2 py-0.5 rounded font-medium pointer-events-none">{dur}</div>
        )}
      </div>
      <div className="mt-3 space-y-2">
        <CardAuthor pubkey={event.pubkey} />
        <h3 className="text-sm font-semibold leading-snug line-clamp-2 group-hover:text-primary transition-colors">{title}</h3>
        <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Clock className="size-3.5 shrink-0" />{timeAgo(event.created_at)}</p>
      </div>
    </div>
  );
}

function VideoSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="w-full aspect-video rounded-xl" />
      <div className="flex items-center gap-2"><Skeleton className="size-8 rounded-full shrink-0" /><Skeleton className="h-3 w-28" /></div>
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-3 w-24" />
    </div>
  );
}

// ── Live streams — targeted query: status=live only, limit 10 ─────────────────

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

function LiveStreamCard({ event }: { event: NostrEvent }) {
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
  const profileUrl = useProfileUrl(event.pubkey, meta);

  return (
    <div
      className="cursor-pointer group shrink-0 w-60"
      onClick={onClick}
      onAuxClick={onAuxClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
    >
      <div className="relative aspect-video overflow-hidden rounded-xl bg-muted">
        {imageUrl ? (
          <img src={imageUrl} alt={title} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-red-950/40 to-muted">
            <Radio className="size-6 text-red-400/60" />
          </div>
        )}
        <div className="absolute top-2 left-2">
          <Badge className="text-xs px-1.5 py-0.5 bg-red-600 text-white border-red-600 flex items-center gap-1">
            <span className="size-1.5 rounded-full bg-white animate-pulse" />LIVE
          </Badge>
        </div>
        {viewers && (
          <div className="absolute bottom-2 right-2 flex items-center gap-1 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded">
            <Eye className="size-3" />{viewers}
          </div>
        )}
      </div>
      <div className="mt-2 flex items-start gap-2">
        <Link to={profileUrl} onClick={(e) => e.stopPropagation()} className="shrink-0 mt-0.5">
          <Avatar className="size-7">
            <AvatarImage src={meta?.picture} alt={displayName} />
            <AvatarFallback className="bg-primary/20 text-primary text-[10px]">{displayName[0]?.toUpperCase()}</AvatarFallback>
          </Avatar>
        </Link>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium leading-snug line-clamp-2 group-hover:text-primary transition-colors">{title}</p>
          <p className="text-xs text-muted-foreground truncate mt-0.5">{displayName}</p>
        </div>
      </div>
    </div>
  );
}

function LiveStreamsStrip({ tab }: { tab: FeedTab }) {
  const { data: liveEvents = [] } = useLiveStreams(tab);
  if (liveEvents.length === 0) return null;

  return (
    <div className="px-4 pt-3 pb-5">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold mb-3">
        <span className="size-2 rounded-full bg-red-500 animate-pulse shrink-0" />
        Live Now
        <Badge variant="secondary" className="ml-1 text-xs">{liveEvents.length}</Badge>
      </h2>
      <div className="flex gap-4 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        {liveEvents.map((e) => <LiveStreamCard key={e.id} event={e} />)}
      </div>
    </div>
  );
}

// ── Shorts grid thumbnail ─────────────────────────────────────────────────────

function ShortThumb({ event, onClick }: { event: NostrEvent; onClick: () => void }) {
  const { thumbnail, blurhash } = parseVideoImeta(event.tags);
  const title = getTag(event.tags, 'title') ?? (event.content.slice(0, 60) || 'Short');
  const [imgLoaded, setImgLoaded] = useState(false);

  return (
    <button className="group block w-full text-left focus:outline-none" onClick={onClick} aria-label={title}>
      <div className="relative w-full aspect-[9/16] overflow-hidden rounded-xl bg-muted">
        {blurhash && !imgLoaded && (
          <Blurhash hash={blurhash} width="100%" height="100%" resolutionX={32} resolutionY={32} punch={1}
            className="absolute inset-0" style={{ width: '100%', height: '100%' }} />
        )}
        {thumbnail ? (
          <img
            src={thumbnail}
            alt={title}
            className={cn('w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]', imgLoaded ? 'opacity-100' : 'opacity-0')}
            loading="lazy"
            onLoad={() => setImgLoaded(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Play className="size-8 text-muted-foreground/30" />
          </div>
        )}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/25">
          <div className="size-12 rounded-full bg-black/60 flex items-center justify-center">
            <Play className="size-6 text-white fill-white ml-0.5" />
          </div>
        </div>
      </div>
      <p className="mt-1.5 text-xs font-medium line-clamp-2 leading-snug group-hover:text-primary transition-colors w-full overflow-hidden">{title}</p>
    </button>
  );
}

// ── Shorts full-screen player (VineCard) with back-to-grid button ─────────────

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

  // Scroll to startIndex on mount
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.scrollTo({ top: startIndex * container.clientHeight, behavior: 'instant' });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // IntersectionObserver syncs activeIndex as user scrolls
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

  // Keyboard nav + Escape to go back
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

  // Same structure as VinesFeedPage: tab bar + snap container, filling the feed column
  return (
    <div className="flex-1 min-w-0 flex flex-col">
      {/* Tab bar — same chrome as VinesTabBar, back button replaces tabs */}
      <div className="flex border-b border-border sticky top-mobile-bar sidebar:top-0 bg-background/80 backdrop-blur-md z-10 shrink-0">
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 px-4 py-3.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-4" />
          Back to Videos
        </button>
      </div>

      {/* Snap-scroll VineCard column — identical sizing to VinesFeedPage */}
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

// ── Shorts grid section ───────────────────────────────────────────────────────

function ShortsSection({ events, onOpen }: { events: NostrEvent[]; onOpen: (index: number) => void }) {
  if (events.length === 0) return null;

  return (
    <section>
      <h2 className="flex items-center gap-2 text-base font-semibold mb-4 px-4">
        <Play className="size-4" />Shorts
      </h2>
      <div
        className="flex gap-3 overflow-x-auto px-4 pb-2"
        style={{ scrollbarWidth: 'none' }}
      >
        {events.map((e, i) => (
          <div key={e.id} className="shrink-0 w-36">
            <ShortThumb event={e} onClick={() => onOpen(i)} />
          </div>
        ))}
      </div>
    </section>
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

  // ── Follows: chronological, small page ──
  const followsQuery = useFeed('follows', { kinds: [21, 22] });

  // ── Global: sort:hot, limit 8/page ──
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

  const normalVideos = useMemo(() => videoEvents.filter((e) => e.kind === 21), [videoEvents]);
  const shorts = useMemo(() => videoEvents.filter((e) => e.kind === 22), [videoEvents]);

  const [shortsPlayerIndex, setShortsPlayerIndex] = useState<number | null>(null);

  const showSkeleton = isPending || (isLoading && !rawData);

  // When the shorts player is open, render it directly as the page root —
  // same flex-1 column that VinesFeedPage uses, fully replacing the feed UI.
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
    <main className="min-h-screen">
      {/* Header */}
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

      {/* Follows / Global tabs */}
      <div className="flex border-b border-border sticky top-mobile-bar sidebar:top-0 bg-background/80 backdrop-blur-md z-10">
        <TabButton label="Follows" active={feedTab === 'follows'} onClick={() => setFeedTab('follows')} disabled={!user} />
        <TabButton label="Global" active={feedTab === 'global'} onClick={() => setFeedTab('global')} />
      </div>

      {/* Live streams strip — follows tab filters by followed authors */}
      <LiveStreamsStrip tab={feedTab} />

      {showSkeleton ? (
        <div className="pt-6 pb-8 space-y-10">
          <div>
            <Skeleton className="h-5 w-24 mb-5 mx-4" />
            <div className="flex gap-4 overflow-hidden px-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="shrink-0 w-72"><VideoSkeleton /></div>
              ))}
            </div>
          </div>
        </div>
      ) : videoEvents.length === 0 ? (
        <div className="py-16 px-8 text-center">
          <Film className="size-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground">
            No videos yet.{feedTab === 'follows' ? ' Follow some creators or switch to Global.' : ' Check your relay connections or come back soon.'}
          </p>
        </div>
      ) : (
        <div className="pt-5 space-y-10 pb-8">
          {/* Normal videos — horizontal scroll row */}
          {normalVideos.length > 0 && (
            <section>
              <h2 className="flex items-center gap-2 text-base font-semibold mb-4 px-4">
                <Film className="size-4" />Videos
              </h2>
              <div
                className="flex gap-4 overflow-x-auto px-4 pb-2"
                style={{ scrollbarWidth: 'none' }}
              >
                {normalVideos.map((e) => (
                  <div key={e.id} className="shrink-0 w-72">
                    <VideoGridCard event={e} />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Shorts — horizontal scroll row of portrait thumbs, tap opens player */}
          {shorts.length > 0 && <ShortsSection events={shorts} onOpen={setShortsPlayerIndex} />}
        </div>
      )}

    </main>
  );
}

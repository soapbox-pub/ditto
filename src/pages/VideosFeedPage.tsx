/**
 * VideosFeedPage — unified video feed.
 *
 * Structure (top → bottom, no tabs within the page):
 *   ┌─ Header ──────────────────────────────────────────────┐
 *   │  Follows | Global  (tab strip, mirrors main Feed)     │
 *   ├─ Live Now strip ──────────────────────────────────────┤
 *   │  Real-time kind 30311 cards, status=live only         │
 *   │  Hidden when no live streams are found                │
 *   ├─ Videos ──────────────────────────────────────────────┤
 *   │  kinds 21 (normal) + 22 (shorts) — infinite scroll   │
 *   │  Shorts open a vine-style full-screen player          │
 *   └───────────────────────────────────────────────────────┘
 */

import {
  useState, useEffect, useMemo, useCallback, useRef,
} from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, Film, Radio, Play, Clock, Eye,
  Volume2, VolumeX, Heart, Zap, MoreHorizontal,
} from 'lucide-react';
import { useSeoMeta } from '@unhead/react';
import { nip19 } from 'nostr-tools';
import { useInView } from 'react-intersection-observer';
import { Loader2 } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAuthor } from '@/hooks/useAuthor';
import { useStreamKind } from '@/hooks/useStreamKind';
import { useLayoutOptions } from '@/contexts/LayoutContext';
import { useOpenPost } from '@/hooks/useOpenPost';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { useFeed } from '@/hooks/useFeed';
import { useMuteList } from '@/hooks/useMuteList';
import { isEventMuted } from '@/lib/muteHelpers';
import { useEventStats } from '@/hooks/useTrending';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useUserReaction } from '@/hooks/useUserReaction';
import { useBlossomFallback } from '@/hooks/useBlossomFallback';
import { getDisplayName } from '@/lib/getDisplayName';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { KindInfoButton } from '@/components/KindInfoButton';
import { sidebarItemIcon } from '@/lib/sidebarItems';
import { getExtraKindDef } from '@/lib/extraKinds';
import { NoteMoreMenu } from '@/components/NoteMoreMenu';
import { RepostMenu } from '@/components/RepostMenu';
import { ZapDialog } from '@/components/ZapDialog';
import { RepostIcon } from '@/components/icons/RepostIcon';
import { ProfileHoverCard } from '@/components/ProfileHoverCard';
import { canZap } from '@/lib/canZap';
import { timeAgo } from '@/lib/timeAgo';
import { cn } from '@/lib/utils';
import type { FeedItem } from '@/lib/feedUtils';

const videosDef = getExtraKindDef('videos')!;

type FeedTab = 'follows' | 'global';

// ── Helpers ───────────────────────────────────────────────────────────────────

function getTag(tags: string[][], name: string): string | undefined {
  return tags.find(([n]) => n === name)?.[1];
}

function parseVideoImeta(tags: string[][]): { url?: string; thumbnail?: string; duration?: string } {
  for (const tag of tags) {
    if (tag[0] !== 'imeta') continue;
    const parts: Record<string, string> = {};
    for (let i = 1; i < tag.length; i++) {
      const p = tag[i];
      const sp = p.indexOf(' ');
      if (sp !== -1) parts[p.slice(0, sp)] = p.slice(sp + 1);
    }
    if (parts.url) return { url: parts.url, thumbnail: parts.image, duration: parts.duration };
  }
  return { url: getTag(tags, 'url'), thumbnail: getTag(tags, 'thumb') ?? getTag(tags, 'image') };
}

function fmtDuration(s: string | undefined): string | undefined {
  const n = parseFloat(s ?? '');
  if (isNaN(n) || n <= 0) return undefined;
  const h = Math.floor(n / 3600), m = Math.floor((n % 3600) / 60), sec = Math.floor(n % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function fmtSats(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(n);
}

// Module-level mute state shared with ShortVideoPlayer
let _globalMuted = true;

// ── Tab button (exact Feed.tsx style) ─────────────────────────────────────────

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
        <Skeleton className="size-7 rounded-full shrink-0" />
        <Skeleton className="h-3 w-24" />
      </div>
    );
  }

  return (
    <Link to={profileUrl} className="flex items-center gap-2 group/a min-w-0" onClick={(e) => e.stopPropagation()}>
      <Avatar className="size-7 shrink-0">
        <AvatarImage src={metadata?.picture} alt={displayName} />
        <AvatarFallback className="bg-primary/20 text-primary text-[10px]">{displayName[0]?.toUpperCase()}</AvatarFallback>
      </Avatar>
      <span className="text-xs text-muted-foreground group-hover/a:text-foreground transition-colors truncate">{displayName}</span>
    </Link>
  );
}

// ── Video grid card ───────────────────────────────────────────────────────────

function VideoGridCard({ event, onShortClick }: { event: NostrEvent; onShortClick: (e: NostrEvent) => void }) {
  const { thumbnail, duration } = parseVideoImeta(event.tags);
  const title = getTag(event.tags, 'title') ?? (event.content.slice(0, 80) || 'Untitled');
  const isShort = event.kind === 22;
  const dur = fmtDuration(duration);

  const noteId = nip19.noteEncode(event.id);
  const { onClick, onAuxClick } = useOpenPost(`/${noteId}`);

  const handleClick = isShort
    ? (e: React.MouseEvent) => { e.preventDefault(); onShortClick(event); }
    : onClick;

  return (
    <div
      className="cursor-pointer group"
      onClick={handleClick}
      onAuxClick={isShort ? undefined : onAuxClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && handleClick(e as unknown as React.MouseEvent)}
    >
      <div className={cn('relative overflow-hidden rounded-xl bg-muted', isShort ? 'aspect-[9/16]' : 'aspect-video')}>
        {thumbnail ? (
          <img src={thumbnail} alt={title} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" loading="lazy" />
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
        {dur && (
          <div className="absolute bottom-2 right-2 bg-black/80 text-white text-[10px] px-1.5 py-0.5 rounded font-medium pointer-events-none">{dur}</div>
        )}
        {isShort && (
          <div className="absolute top-2 left-2">
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5 bg-black/60 text-white border-0">Short</Badge>
          </div>
        )}
      </div>
      <div className="mt-2 space-y-1.5">
        <CardAuthor pubkey={event.pubkey} />
        <h3 className="text-sm font-medium leading-snug line-clamp-2 group-hover:text-primary transition-colors">{title}</h3>
        <p className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="size-3 shrink-0" />{timeAgo(event.created_at)}</p>
      </div>
    </div>
  );
}

function VideoSkeleton({ isShort }: { isShort?: boolean }) {
  return (
    <div className="space-y-2.5">
      <Skeleton className={cn('w-full rounded-xl', isShort ? 'aspect-[9/16]' : 'aspect-video')} />
      <div className="flex items-center gap-2"><Skeleton className="size-7 rounded-full shrink-0" /><Skeleton className="h-3 w-24" /></div>
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-3 w-20" />
    </div>
  );
}

// ── Live streams strip ────────────────────────────────────────────────────────

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
      className="cursor-pointer group shrink-0 w-56"
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
        {/* LIVE badge */}
        <div className="absolute top-2 left-2">
          <Badge className="text-[10px] px-1.5 py-0.5 bg-red-600 text-white border-red-600 flex items-center gap-1">
            <span className="size-1.5 rounded-full bg-white animate-pulse" />
            LIVE
          </Badge>
        </div>
        {viewers && (
          <div className="absolute bottom-2 right-2 flex items-center gap-1 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded">
            <Eye className="size-3" />{viewers}
          </div>
        )}
      </div>
      <div className="mt-1.5 flex items-start gap-2">
        <Link to={profileUrl} onClick={(e) => e.stopPropagation()} className="shrink-0 mt-0.5">
          <Avatar className="size-6">
            <AvatarImage src={meta?.picture} alt={displayName} />
            <AvatarFallback className="bg-primary/20 text-primary text-[9px]">{displayName[0]?.toUpperCase()}</AvatarFallback>
          </Avatar>
        </Link>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium leading-snug line-clamp-2 group-hover:text-primary transition-colors">{title}</p>
          <p className="text-[10px] text-muted-foreground truncate mt-0.5">{displayName}</p>
        </div>
      </div>
    </div>
  );
}

/** Horizontally-scrolling strip of live streams. Only renders if there are live events. */
function LiveStreamsStrip() {
  const { events, isLoading } = useStreamKind(30311);
  const liveEvents = useMemo(
    () => events.filter((e) => getTag(e.tags, 'status') === 'live'),
    [events],
  );

  if (isLoading && events.length === 0) return null; // don't flash a skeleton
  if (liveEvents.length === 0) return null;

  return (
    <div className="px-4 pt-2 pb-4 border-b border-border">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold mb-3">
        <span className="size-2 rounded-full bg-red-500 animate-pulse shrink-0" />
        Live Now
        <Badge variant="secondary" className="ml-1 text-[10px]">{liveEvents.length}</Badge>
      </h2>
      <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
        {liveEvents.map((e) => <LiveStreamCard key={e.id} event={e} />)}
      </div>
    </div>
  );
}

// ── Short video player (vine-style full-screen overlay) ───────────────────────

function ShortVideoPlayer({ events, startIndex, onClose }: {
  events: NostrEvent[];
  startIndex: number;
  onClose: () => void;
}) {
  const [activeIndex, setActiveIndex] = useState(startIndex);
  const [isMuted, setIsMuted] = useState(_globalMuted);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const event = events[activeIndex];
  const { url, thumbnail } = parseVideoImeta(event?.tags ?? []);
  const title = getTag(event?.tags ?? [], 'title');
  const author = useAuthor(event?.pubkey ?? '');
  const meta = author.data?.metadata;
  const displayName = getDisplayName(meta, event?.pubkey ?? '');
  const profileUrl = useProfileUrl(event?.pubkey ?? '', meta);
  const { data: stats } = useEventStats(event?.id ?? '');
  const { user } = useCurrentUser();
  const { mutate: publish } = useNostrPublish();
  const userReaction = useUserReaction(event?.id);
  const hasReacted = !!userReaction;
  const canZapAuthor = user && canZap(meta);
  const { src, onError } = useBlossomFallback(url ?? '');

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !url) return;
    v.currentTime = 0;
    v.muted = _globalMuted;
    setIsMuted(_globalMuted);
    setHasStarted(false);
    setIsPlaying(false);
    v.play().catch(() => {});
  }, [activeIndex, url]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowUp' && activeIndex > 0) setActiveIndex((i) => i - 1);
      if (e.key === 'ArrowDown' && activeIndex < events.length - 1) setActiveIndex((i) => i + 1);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, activeIndex, events.length]);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play(); } else { v.pause(); }
  }, []);

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    const next = !v.muted;
    v.muted = next;
    _globalMuted = next;
    setIsMuted(next);
  }, []);

  const handleReact = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user || hasReacted || !event) return;
    publish({ kind: 7, content: '+', tags: [['e', event.id], ['p', event.pubkey], ['k', String(event.kind)]] });
  }, [user, hasReacted, event, publish]);

  if (!event) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black flex overflow-hidden">
      {/* Back button */}
      <button
        className="absolute top-4 left-4 z-20 p-2 rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors"
        onClick={onClose}
        aria-label="Back to Videos"
      >
        <ArrowLeft className="size-5" />
      </button>

      {/* Mute */}
      <button
        className="absolute top-4 right-4 z-20 size-9 rounded-full bg-black/40 flex items-center justify-center text-white hover:bg-black/60 transition-colors"
        onClick={toggleMute}
        aria-label={isMuted ? 'Unmute' : 'Mute'}
      >
        {isMuted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
      </button>

      {/* Video area */}
      <div className="flex-1 relative flex items-center justify-center bg-black" onClick={togglePlay}>
        {url ? (
          <>
            <video
              ref={videoRef}
              src={src}
              poster={thumbnail}
              className="max-h-full max-w-full object-contain"
              loop
              playsInline
              muted={isMuted}
              preload="auto"
              onPlay={() => { setIsPlaying(true); setHasStarted(true); }}
              onPause={() => setIsPlaying(false)}
              onError={onError}
            />
            {!hasStarted && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="size-20 rounded-full bg-black/40 flex items-center justify-center backdrop-blur-sm border border-white/20">
                  <Play className="size-10 text-white ml-1.5" fill="white" />
                </div>
              </div>
            )}
            {hasStarted && !isPlaying && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="size-16 rounded-full bg-black/40 flex items-center justify-center backdrop-blur-sm border border-white/20">
                  <Play className="size-8 text-white ml-1" fill="white" />
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="text-white/40 text-sm">No video</div>
        )}

        {/* Gradients */}
        <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/60 to-transparent pointer-events-none" />
        <div className="absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-black/90 via-black/40 to-transparent pointer-events-none" />

        {/* Bottom info */}
        <div className="absolute bottom-6 left-4 right-16 z-10 space-y-1" onClick={(e) => e.stopPropagation()}>
          <Link to={profileUrl} className="block hover:underline">
            <span className="font-bold text-white text-[15px] drop-shadow">{displayName}</span>
          </Link>
          {title && <p className="text-white/90 text-sm line-clamp-2 drop-shadow">{title}</p>}
        </div>
      </div>

      {/* Right action column */}
      <div className="absolute right-3 bottom-24 z-20 flex flex-col items-center gap-5" onClick={(e) => e.stopPropagation()}>
        <ProfileHoverCard pubkey={event.pubkey} asChild>
          <Link to={profileUrl} onClick={(e) => e.stopPropagation()}>
            <Avatar className="size-11 border-2 border-white shadow-lg">
              <AvatarImage src={meta?.picture} alt={displayName} />
              <AvatarFallback className="bg-primary/80 text-white text-sm font-bold">{displayName[0]?.toUpperCase()}</AvatarFallback>
            </Avatar>
          </Link>
        </ProfileHoverCard>

        {/* Like */}
        <div className="flex flex-col items-center gap-1">
          <button
            className={cn('size-11 rounded-full flex items-center justify-center backdrop-blur-sm bg-black/20 hover:bg-white/10 transition-colors', hasReacted ? 'text-pink-500' : 'text-white hover:text-pink-400')}
            onClick={handleReact}
          >
            <Heart className="size-6" fill={hasReacted ? 'currentColor' : 'none'} />
          </button>
          {stats?.reactions ? <span className="text-white text-xs">{stats.reactions}</span> : null}
        </div>

        {/* Repost */}
        <RepostMenu event={event}>
          {(isReposted: boolean) => (
            <div className="flex flex-col items-center gap-1">
              <button className={cn('size-11 rounded-full flex items-center justify-center backdrop-blur-sm bg-black/20 hover:bg-white/10 transition-colors', isReposted ? 'text-accent' : 'text-white hover:text-accent')}>
                <RepostIcon className="size-6" />
              </button>
              {(stats?.reposts || stats?.quotes) ? <span className="text-white text-xs">{(stats?.reposts ?? 0) + (stats?.quotes ?? 0)}</span> : null}
            </div>
          )}
        </RepostMenu>

        {/* Zap */}
        {canZapAuthor && (
          <ZapDialog target={event}>
            <div className="flex flex-col items-center gap-1">
              <button className="size-11 rounded-full flex items-center justify-center backdrop-blur-sm bg-black/20 hover:bg-white/10 text-white hover:text-amber-400 transition-colors">
                <Zap className="size-6" />
              </button>
              {stats?.zapAmount ? <span className="text-white text-xs">{fmtSats(stats.zapAmount)}</span> : null}
            </div>
          </ZapDialog>
        )}

        {/* More */}
        <button
          className="size-11 rounded-full flex items-center justify-center backdrop-blur-sm bg-black/20 hover:bg-white/10 text-white/80 hover:text-white transition-colors"
          onClick={() => setMoreOpen(true)}
        >
          <MoreHorizontal className="size-6" />
        </button>
      </div>

      {/* Up / Down navigation */}
      <div className="absolute right-0 top-1/2 -translate-y-1/2 z-20 flex flex-col gap-2 pr-2" onClick={(e) => e.stopPropagation()}>
        {activeIndex > 0 && (
          <button className="p-2 rounded-full bg-black/40 text-white hover:bg-black/60" onClick={() => setActiveIndex((i) => i - 1)} aria-label="Previous short">
            <svg className="size-5 rotate-180" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
          </button>
        )}
        {activeIndex < events.length - 1 && (
          <button className="p-2 rounded-full bg-black/40 text-white hover:bg-black/60" onClick={() => setActiveIndex((i) => i + 1)} aria-label="Next short">
            <svg className="size-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
          </button>
        )}
      </div>

      <NoteMoreMenu event={event} open={moreOpen} onOpenChange={setMoreOpen} />
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function VideosFeedPage() {
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const { muteItems } = useMuteList();

  const [feedTab, setFeedTab] = useState<FeedTab>(user ? 'follows' : 'global');
  const [shortPlayer, setShortPlayer] = useState<{ events: NostrEvent[]; index: number } | null>(null);

  useSeoMeta({
    title: `Videos | ${config.appName}`,
    description: 'Videos and live streams on Nostr',
  });

  useLayoutOptions({ showFAB: false });

  useEffect(() => {
    if (user) setFeedTab('follows');
  }, [user]);

  // Infinite video feed (kinds 21 & 22)
  const feedQuery = useFeed(feedTab, { kinds: [21, 22] });
  const { data: rawData, isPending, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = feedQuery;

  // Auto-fetch page 2
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && rawData?.pages?.length === 1) fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, rawData?.pages?.length, fetchNextPage]);

  // Infinite scroll sentinel
  const { ref: scrollRef, inView } = useInView({ threshold: 0, rootMargin: '400px' });
  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const videoEvents = useMemo(() => {
    if (!rawData?.pages) return [];
    const seen = new Set<string>();
    return (rawData.pages as unknown as { items: FeedItem[] }[])
      .flatMap((p) => p.items)
      .filter((item) => {
        if (seen.has(item.event.id)) return false;
        seen.add(item.event.id);
        if (muteItems.length > 0 && isEventMuted(item.event, muteItems)) return false;
        return !!parseVideoImeta(item.event.tags).url;
      })
      .map((item) => item.event);
  }, [rawData?.pages, muteItems]);

  const shorts = useMemo(() => videoEvents.filter((e) => e.kind === 22), [videoEvents]);
  const normalVideos = useMemo(() => videoEvents.filter((e) => e.kind === 21), [videoEvents]);

  const openShortPlayer = useCallback((events: NostrEvent[], index: number) => {
    setShortPlayer({ events, index });
  }, []);
  const closeShortPlayer = useCallback(() => setShortPlayer(null), []);

  const showSkeleton = isPending || (isLoading && !rawData);

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

      {/* Follows / Global tabs — identical to Feed.tsx */}
      <div className="flex border-b border-border sticky top-mobile-bar sidebar:top-0 bg-background/80 backdrop-blur-md z-10">
        <TabButton label="Follows" active={feedTab === 'follows'} onClick={() => setFeedTab('follows')} disabled={!user} />
        <TabButton label="Global" active={feedTab === 'global'} onClick={() => setFeedTab('global')} />
      </div>

      {/* Live streams strip — always global, real-time, shown only when live streams exist */}
      <LiveStreamsStrip />

      {/* Video grid */}
      {showSkeleton ? (
        <div className="px-4 pt-6 pb-8 space-y-8">
          <div>
            <Skeleton className="h-5 w-32 mb-4" />
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
              {Array.from({ length: 8 }).map((_, i) => <VideoSkeleton key={i} />)}
            </div>
          </div>
        </div>
      ) : videoEvents.length === 0 ? (
        <div className="py-16 px-8 text-center">
          <Film className="size-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground">
            No videos yet.
            {feedTab === 'follows'
              ? ' Follow some creators or switch to Global.'
              : ' Check your relay connections or come back soon.'}
          </p>
        </div>
      ) : (
        <div className="px-4 pt-4 pb-8 space-y-10">
          {/* Normal videos */}
          {normalVideos.length > 0 && (
            <section>
              <h2 className="flex items-center gap-2 text-sm font-semibold mb-4">
                <Film className="size-4" />Videos
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
                {normalVideos.map((e) => (
                  <VideoGridCard key={e.id} event={e} onShortClick={() => {}} />
                ))}
              </div>
            </section>
          )}

          {/* Shorts */}
          {shorts.length > 0 && (
            <section>
              <h2 className="flex items-center gap-2 text-sm font-semibold mb-4">
                <Play className="size-4" />Shorts
              </h2>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3">
                {shorts.map((e) => (
                  <VideoGridCard
                    key={e.id}
                    event={e}
                    onShortClick={(ev) => openShortPlayer(shorts, shorts.indexOf(ev))}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Infinite scroll sentinel */}
          <div ref={scrollRef} className="py-2">
            {isFetchingNextPage && (
              <div className="flex justify-center">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Short video player overlay */}
      {shortPlayer && (
        <ShortVideoPlayer
          events={shortPlayer.events}
          startIndex={shortPlayer.index}
          onClose={closeShortPlayer}
        />
      )}
    </main>
  );
}

import {
  useRef,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import {
  MessageCircle,
  Zap,
  Volume2,
  VolumeX,
  MoreHorizontal,
  Play,
  Heart,
} from 'lucide-react';
import { FeedEmptyState } from '@/components/FeedEmptyState';

import type { NostrEvent } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { useStreamKind } from '@/hooks/useStreamKind';
import { useAuthor } from '@/hooks/useAuthor';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useFeedTab } from '@/hooks/useFeedTab';
import { useEventStats, type EventStats } from '@/hooks/useTrending';
import { useAppContext } from '@/hooks/useAppContext';
import { useBlossomFallback } from '@/hooks/useBlossomFallback';
import { useLayoutOptions } from '@/contexts/LayoutContext';
import { useFollowList } from '@/hooks/useFollowActions';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useUserReaction } from '@/hooks/useUserReaction';
import { RepostIcon } from '@/components/icons/RepostIcon';
import { useRepostStatus } from '@/hooks/useRepostStatus';
import { useDeleteEvent } from '@/hooks/useDeleteEvent';
import { getRepostKind } from '@/lib/feedUtils';
import { DITTO_RELAY } from '@/lib/appRelays';
import { ZapDialog } from '@/components/ZapDialog';
import { NoteMoreMenu } from '@/components/NoteMoreMenu';
import { ProfileHoverCard } from '@/components/ProfileHoverCard';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { getAvatarShape } from '@/lib/avatarShape';
import { Skeleton } from '@/components/ui/skeleton';


import { CommentsSheet } from '@/components/CommentsSheet';
import { getDisplayName } from '@/lib/getDisplayName';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { canZap } from '@/lib/canZap';
import { cn } from '@/lib/utils';

const VINE_KIND = 34236;

type FeedTab = 'follows' | 'global';

/** Formats a sats amount into a compact human-readable string. */
function formatSats(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return n.toString();
}

/** Parse imeta tags for a vine event → { url, thumbnail }. */
function parseVineImeta(tags: string[][]): { url?: string; thumbnail?: string } {
  const tag = tags.find(([n]) => n === 'imeta');
  if (!tag) return {};
  const result: Record<string, string> = {};
  for (let i = 1; i < tag.length; i++) {
    const part = tag[i];
    const sp = part.indexOf(' ');
    if (sp === -1) continue;
    result[part.slice(0, sp)] = part.slice(sp + 1);
  }
  return { url: result.url, thumbnail: result.image };
}

function getTag(tags: string[][], name: string): string | undefined {
  return tags.find(([n]) => n === name)?.[1];
}



// ─── Global mute state shared across vine cards ───────────────────────────────
/** Module-level mute state shared across all vine/short players. */
let globalMuted = true;
function setGlobalMuted(v: boolean) { globalMuted = v; }

// ─── Hook: stream vine events for follows or global ──────────────────────────

function useVinesFeed(tab: FeedTab) {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { data: followData } = useFollowList();

  // For follows tab: finite query filtered by authors
  const followsQuery = useQuery<NostrEvent[]>({
    queryKey: ['vines-follows', user?.pubkey ?? '', followData?.pubkeys?.join(',') ?? ''],
    queryFn: async ({ signal }) => {
      if (!user) return [];
      const authors = followData?.pubkeys?.length
        ? [...followData.pubkeys, user.pubkey]
        : [user.pubkey];
      const events = await nostr.query(
        [{ kinds: [VINE_KIND], authors, limit: 40 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) },
      );
      return events.sort((a, b) => b.created_at - a.created_at);
    },
    enabled: tab === 'follows' && !!user && followData !== undefined,
    staleTime: 60 * 1000,
  });

  // For global tab: streaming hook
  const { events: globalEvents, isLoading: globalLoading } = useStreamKind(
    tab === 'global' ? VINE_KIND : [],
  );

  if (tab === 'follows') {
    return {
      events: followsQuery.data ?? [],
      isLoading: followsQuery.isPending,
    };
  }

  return { events: globalEvents, isLoading: globalLoading };
}

// ─── VineHeartButton ─────────────────────────────────────────────────────────

export function VineHeartButton({ event, label, noBackground }: { event: NostrEvent; label?: string; noBackground?: boolean }) {
  const { user } = useCurrentUser();
  const userReaction = useUserReaction(event.id);
  const { mutate: publishEvent } = useNostrPublish();
  const queryClient = useQueryClient();
  const hasReacted = !!userReaction;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user || hasReacted) return;

    // Optimistically update stats cache
    const prevStats = queryClient.getQueryData<EventStats>(['event-stats', event.id]);
    if (prevStats) {
      queryClient.setQueryData<EventStats>(['event-stats', event.id], {
        ...prevStats,
        reactions: prevStats.reactions + 1,
      });
    }
    // Optimistically mark user as having reacted
    queryClient.setQueryData(['user-reaction', event.id], { content: '👍' });

    publishEvent(
      { kind: 7, content: '+', tags: [['e', event.id], ['p', event.pubkey], ['k', String(event.kind)]] },
      {
        onError: () => {
          // Revert optimistic updates
          if (prevStats) {
            queryClient.setQueryData<EventStats>(['event-stats', event.id], prevStats);
          }
          queryClient.removeQueries({ queryKey: ['user-reaction', event.id] });
        },
      },
    );
  };

  return (
    <VineActionButton label={label}>
      <button
        className={cn(
          'size-11 rounded-full flex items-center justify-center transition-colors backdrop-blur-sm',
          !noBackground && 'bg-black/20 hover:bg-white/10',
          hasReacted ? 'text-pink-500' : 'text-white hover:text-pink-400',
        )}
        onClick={handleClick}
      >
        <Heart className="size-6" fill={hasReacted ? 'currentColor' : 'none'} />
      </button>
    </VineActionButton>
  );
}

// ─── VineRepostButton ────────────────────────────────────────────────────────

export function VineRepostButton({ event, label }: { event: NostrEvent; label?: string }) {
  const { user } = useCurrentUser();
  const { mutate: publishEvent } = useNostrPublish();
  const { mutate: deleteEvent } = useDeleteEvent();
  const queryClient = useQueryClient();
  const repostEventId = useRepostStatus(event.id);
  const isReposted = !!repostEventId;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) return;

    const repostKind = getRepostKind(event.kind);
    const prevStats = queryClient.getQueryData<EventStats>(['event-stats', event.id]);

    if (isReposted && repostEventId) {
      // Undo repost
      if (prevStats) {
        queryClient.setQueryData<EventStats>(['event-stats', event.id], {
          ...prevStats,
          reposts: Math.max(0, prevStats.reposts - 1),
        });
      }
      const prevRepostStatus = queryClient.getQueryData(['user-repost', event.id]);
      queryClient.setQueryData(['user-repost', event.id], null);

      deleteEvent(
        { eventId: repostEventId, eventKind: repostKind },
        {
          onError: () => {
            if (prevStats) queryClient.setQueryData<EventStats>(['event-stats', event.id], prevStats);
            queryClient.setQueryData(['user-repost', event.id], prevRepostStatus);
          },
        },
      );
    } else {
      // Repost
      if (prevStats) {
        queryClient.setQueryData<EventStats>(['event-stats', event.id], {
          ...prevStats,
          reposts: prevStats.reposts + 1,
        });
      }
      queryClient.setQueryData(['user-repost', event.id], 'optimistic');

      const tags: string[][] = [['e', event.id, DITTO_RELAY], ['p', event.pubkey]];
      if (repostKind === 16) {
        tags.push(['k', String(event.kind)]);
        if (event.kind >= 30000 && event.kind < 40000) {
          const dTag = event.tags.find(([name]) => name === 'd')?.[1] ?? '';
          tags.push(['a', `${event.kind}:${event.pubkey}:${dTag}`]);
        }
      }

      publishEvent(
        { kind: repostKind, content: '', tags },
        {
          onError: () => {
            if (prevStats) queryClient.setQueryData<EventStats>(['event-stats', event.id], prevStats);
            queryClient.setQueryData(['user-repost', event.id], null);
          },
        },
      );
    }
  };

  return (
    <VineActionButton label={label}>
      <button
        className={cn(
          'size-11 rounded-full flex items-center justify-center transition-colors backdrop-blur-sm bg-black/20 hover:bg-white/10',
          isReposted ? 'text-accent' : 'text-white hover:text-accent',
        )}
        onClick={handleClick}
      >
        <RepostIcon className="size-6" />
      </button>
    </VineActionButton>
  );
}

// ─── VineCard ────────────────────────────────────────────────────────────────

export interface VineCardProps {
  event: NostrEvent;
  isActive: boolean;
  /** True for the card immediately before or after the active one — used to preload video. */
  isNearActive: boolean;
  onCommentClick: () => void;
}

export function VineCard({ event, isActive, isNearActive, onCommentClick }: VineCardProps) {
  const { user } = useCurrentUser();
  const author = useAuthor(event.pubkey);
  const metadata = author.data?.metadata;
  const avatarShape = getAvatarShape(metadata);
  const displayName = getDisplayName(metadata, event.pubkey);
  const profileUrl = useProfileUrl(event.pubkey, metadata);
  const { data: stats } = useEventStats(event.id);
  const canZapAuthor = user && canZap(metadata);

  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [isAttemptingPlay, setIsAttemptingPlay] = useState(isActive);
  const [isMuted, setIsMuted] = useState(globalMuted);
  // true once the browser has decoded enough to render the first frame
  const [isVideoReady, setIsVideoReady] = useState(false);
  // true when the video is stalling / rebuffering mid-playback
  const [isBuffering, setIsBuffering] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);

  const imeta = useMemo(() => parseVineImeta(event.tags), [event.tags]);
  const title = getTag(event.tags, 'title');
  const hashtags = event.tags.filter(([n]) => n === 't').map(([, v]) => v);

  const { src, onError: onBlossomError } = useBlossomFallback(imeta.url ?? '');

  // Reset ready/buffering state when the active vine changes (new src loaded)
  useEffect(() => {
    setIsVideoReady(false);
    setIsBuffering(false);
    setHasStarted(false);
    setIsPlaying(false);
  }, [src]);

  // Auto-play / auto-pause based on active state
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !imeta.url) return;
    if (isActive) {
      video.currentTime = 0;
      video.muted = globalMuted;
      setIsMuted(globalMuted);
      setIsAttemptingPlay(true);
      video.play().catch(() => {
        // Autoplay blocked — leave paused, user can tap
        setIsAttemptingPlay(false);
      });
    } else {
      video.pause();
      video.currentTime = 0;
      setIsAttemptingPlay(false);
      setIsBuffering(false);
    }
  }, [isActive, imeta.url]);

  const togglePlay = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play();
    } else {
      video.pause();
    }
  }, []);

  const toggleMute = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const video = videoRef.current;
    if (!video) return;
    const next = !video.muted;
    video.muted = next;
    setGlobalMuted(next);
    setIsMuted(next);
  }, []);

  return (
    <div className="relative w-full h-full bg-neutral-900 overflow-hidden flex-shrink-0">
      {/* ── Video ────────────────────────────────────────────────────── */}
      {imeta.url ? (
        <>
          <video
            ref={videoRef}
            src={src}
            className="absolute inset-0 w-full h-full object-cover"
            loop
            playsInline
            muted={isMuted}
            preload={isActive ? 'auto' : isNearActive ? 'metadata' : 'none'}
            onCanPlay={() => setIsVideoReady(true)}
            onPlay={() => { setIsPlaying(true); setHasStarted(true); setIsAttemptingPlay(false); setIsBuffering(false); }}
            onPause={() => { setIsPlaying(false); setIsAttemptingPlay(false); }}
            onWaiting={() => { if (hasStarted) setIsBuffering(true); }}
            onStalled={() => { if (hasStarted) setIsBuffering(true); }}
            onPlaying={() => setIsBuffering(false)}
            onError={onBlossomError}
            onClick={togglePlay}
          />

          {/* Thumbnail — shown until the first frame is decoded and ready */}
          {!isVideoReady && imeta.thumbnail && (
            <img
              src={imeta.thumbnail}
              alt=""
              aria-hidden
              className="absolute inset-0 w-full h-full object-cover pointer-events-none"
            />
          )}

          {/* Solid bg fallback when there's no thumbnail and video isn't ready */}
          {!isVideoReady && !imeta.thumbnail && (
            <div className="absolute inset-0 bg-neutral-900 pointer-events-none" />
          )}

          {/* Big play overlay before first play — only shown once video is ready and autoplay isn't attempting */}
          {isVideoReady && !hasStarted && !isAttemptingPlay && (
            <div
              className="absolute inset-0 flex items-center justify-center cursor-pointer"
              onClick={togglePlay}
            >
              <div className="size-20 rounded-full bg-black/40 flex items-center justify-center backdrop-blur-sm border border-white/20">
                <Play className="size-10 text-white ml-1.5" fill="white" />
              </div>
            </div>
          )}

          {/* Tap-to-pause overlay (after first play, while paused) */}
          {hasStarted && !isPlaying && !isBuffering && (
            <div
              className="absolute inset-0 flex items-center justify-center cursor-pointer"
              onClick={togglePlay}
            >
              <div className="size-16 rounded-full bg-black/40 flex items-center justify-center backdrop-blur-sm border border-white/20 animate-in zoom-in-50 duration-150">
                <Play className="size-8 text-white ml-1" fill="white" />
              </div>
            </div>
          )}

          {/* Buffering spinner — shown when rebuffering mid-playback */}
          {isBuffering && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="size-14 rounded-full bg-black/40 backdrop-blur-sm border border-white/10 flex items-center justify-center">
                <svg
                  className="size-7 text-white animate-spin"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  aria-hidden
                >
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="absolute inset-0 bg-neutral-900 flex items-center justify-center">
          <span className="text-white/40 text-sm">No video</span>
        </div>
      )}

      {/* ── Gradient overlays — only rendered once video UI is visible ── */}
      {isVideoReady && (
        <>
          <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/60 to-transparent pointer-events-none" />
          <div className="absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-black/90 via-black/40 to-transparent pointer-events-none" />
        </>
      )}

      {/* ── Mute toggle (top-right) — only shown once video is ready ──── */}
      {isVideoReady && (
        <button
          className="absolute top-4 right-4 z-10 size-9 rounded-full bg-black/40 backdrop-blur-sm border border-white/20 flex items-center justify-center text-white hover:bg-black/60 transition-colors"
          onClick={toggleMute}
          aria-label={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
        </button>
      )}

      {/* ── Right action sidebar — only shown once video is ready ─────── */}
      {isVideoReady && (
        <div className="absolute right-3 bottom-24 z-10 flex flex-col items-center gap-5">
          {/* Author avatar */}
          <ProfileHoverCard pubkey={event.pubkey} asChild>
            <Link
              to={profileUrl}
              onClick={(e) => e.stopPropagation()}
              className="block"
            >
              {author.isLoading ? (
                <Skeleton className="size-11 rounded-full" />
              ) : (
                <Avatar shape={avatarShape} className="size-11 border-2 border-white shadow-lg">
                  <AvatarImage src={metadata?.picture} alt={displayName} />
                  <AvatarFallback className="bg-primary/80 text-white text-sm font-bold">
                    {displayName[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              )}
            </Link>
          </ProfileHoverCard>

          {/* React */}
          <VineHeartButton event={event} label={stats?.reactions ? String(stats.reactions) : undefined} />

          {/* Reply */}
          <VineActionButton
            icon={<MessageCircle className="size-6" />}
            label={stats?.replies ? String(stats.replies) : undefined}
            onClick={(e) => { e.stopPropagation(); onCommentClick(); }}
            className="text-white hover:text-blue-400"
          />

          {/* Repost */}
          <VineRepostButton
            event={event}
            label={(stats?.reposts || stats?.quotes) ? String((stats?.reposts ?? 0) + (stats?.quotes ?? 0)) : undefined}
          />

          {/* Zap */}
          {canZapAuthor && (
            <ZapDialog target={event}>
              <VineActionButton
                icon={<Zap className="size-6" />}
                label={stats?.zapAmount ? formatSats(stats.zapAmount) : undefined}
                className="text-white hover:text-amber-400"
              />
            </ZapDialog>
          )}

          {/* More */}
          <VineActionButton
            icon={<MoreHorizontal className="size-6" />}
            onClick={(e) => { e.stopPropagation(); setMoreMenuOpen(true); }}
            className="text-white/80 hover:text-white"
          />
        </div>
      )}

      {/* ── Bottom info strip — only shown once video is ready ────────── */}
      {isVideoReady && (
        <div className="absolute bottom-6 left-4 right-20 z-10 space-y-1.5">
          <ProfileHoverCard pubkey={event.pubkey} asChild>
            <Link
              to={profileUrl}
              className="block"
              onClick={(e) => e.stopPropagation()}
            >
              <span className="font-bold text-white text-[15px] leading-tight drop-shadow hover:underline">
                {displayName}
              </span>
            </Link>
          </ProfileHoverCard>

          {title && (
            <p className="text-white/90 text-sm leading-snug line-clamp-2 drop-shadow">
              {title}
            </p>
          )}

          {hashtags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {hashtags.slice(0, 4).map((tag) => (
                <Link
                  key={tag}
                  to={`/t/${encodeURIComponent(tag)}`}
                  className="text-xs text-white/70 hover:text-white transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  #{tag}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Modals ───────────────────────────────────────────────────── */}
      <NoteMoreMenu event={event} open={moreMenuOpen} onOpenChange={setMoreMenuOpen} />
    </div>
  );
}

// ─── VineActionButton ─────────────────────────────────────────────────────────

export interface VineActionButtonProps {
  icon?: React.ReactNode;
  label?: string;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  className?: string;
  children?: React.ReactNode;
}

export function VineActionButton({ icon, label, onClick, className, children }: VineActionButtonProps) {
  return (
    <div className="flex flex-col items-center gap-1">
      {children ?? (
        <button
          className={cn(
            'size-11 rounded-full flex items-center justify-center transition-colors backdrop-blur-sm bg-black/20 hover:bg-white/10',
            className,
          )}
          onClick={onClick}
        >
          {icon}
        </button>
      )}
      {label && (
        <span className="text-white text-xs tabular-nums font-medium drop-shadow">{label}</span>
      )}
    </div>
  );
}

// ─── VinesFeedPage ────────────────────────────────────────────────────────────

export function VinesFeedPage() {
  const { config } = useAppContext();
  const { user } = useCurrentUser();

  const [tab, setTab] = useFeedTab<FeedTab>('vines', ['follows', 'global']);

  const { events, isLoading } = useVinesFeed(tab);
  const [activeIndex, setActiveIndex] = useState(0);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [scrollContainer, setScrollContainer] = useState<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const handleCommentClick = useCallback(() => {
    setCommentsOpen(true);
  }, []);

  // Callback ref that wires up both the mutable ref and state for layout context
  const containerCallbackRef = useCallback((node: HTMLDivElement | null) => {
    containerRef.current = node;
    setScrollContainer(node);
  }, []);

  useSeoMeta({
    title: `Vines | ${config.appName}`,
    description: 'Short-form videos on Nostr',
  });

  // Filter to events that have a video URL
  const vines = useMemo(
    () => events.filter((e) => !!parseVineImeta(e.tags).url),
    [events],
  );

  // Reset active index when tab changes
  useEffect(() => {
    setActiveIndex(0);
  }, [tab]);

  const activeVine = vines[activeIndex];

  useLayoutOptions({
    showFAB: false,
    scrollContainer,
  });

  // Lock body scroll when mobile comments are open
  useEffect(() => {
    if (commentsOpen) {
      document.body.style.overflow = 'hidden';
      document.body.style.touchAction = 'none';
    } else {
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
    }
    return () => {
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
    };
  }, [commentsOpen]);

  // Sync activeIndex when CSS snap settles (touch swipe, mouse wheel, trackpad)
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
  }, [vines]);

  // Keyboard arrow navigation
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const container = containerRef.current;
      if (!container) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = Math.min(activeIndex + 1, vines.length - 1);
        container.scrollTo({ top: next * container.clientHeight, behavior: 'smooth' });
        setActiveIndex(next);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = Math.max(activeIndex - 1, 0);
        container.scrollTo({ top: prev * container.clientHeight, behavior: 'smooth' });
        setActiveIndex(prev);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [activeIndex, vines.length]);

  // ── Loading state ────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex-1 min-w-0 flex flex-col">
        <VinesTabBar tab={tab} onTabChange={setTab} hasUser={!!user} />
        {/* Vine card skeleton */}
        <div className="flex-1 relative bg-neutral-900 overflow-hidden">
          <Skeleton className="absolute inset-0 rounded-none bg-neutral-800" />
          {/* Bottom info strip */}
          <div className="absolute bottom-6 left-4 right-20 space-y-2">
            <Skeleton className="h-4 w-28 bg-white/20" />
            <Skeleton className="h-3 w-48 bg-white/10" />
            <Skeleton className="h-3 w-20 bg-white/10" />
          </div>
          {/* Right action buttons */}
          <div className="absolute right-3 bottom-24 flex flex-col items-center gap-5">
            <Skeleton className="size-11 rounded-full bg-white/20" />
            <Skeleton className="size-11 rounded-full bg-white/20" />
            <Skeleton className="size-11 rounded-full bg-white/20" />
            <Skeleton className="size-11 rounded-full bg-white/20" />
          </div>
        </div>
      </div>
    );
  }

  // ── Empty state ──────────────────────────────────────────────────────────
  if (!isLoading && vines.length === 0) {
    return (
      <div className="flex-1 min-w-0 flex flex-col">
        <VinesTabBar tab={tab} onTabChange={setTab} hasUser={!!user} />
        <div className="flex-1 flex items-center justify-center">
          <FeedEmptyState
            message={
              tab === 'follows'
                ? 'None of the people you follow have posted vines yet.'
                : 'No vines found. Check your relay connections or come back soon.'
            }
            onSwitchToGlobal={tab === 'follows' ? () => setTab('global') : undefined}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-w-0 relative flex flex-col">
      {/* ── Tab bar ────────────────────────────────────────────────── */}
      <VinesTabBar tab={tab} onTabChange={setTab} hasUser={!!user} />

      {/* ── Scroll container ────────────────────────────────────────── */}
      <div
        ref={containerCallbackRef}
        className="vine-slide-height sidebar:h-[calc(100vh-3rem)] snap-y snap-mandatory overflow-y-scroll"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', overscrollBehavior: 'none' }}
      >
        {vines.map((event, i) => (
          <div
            key={event.id}
            className="w-full vine-slide-height sidebar:h-[calc(100vh-3rem)] snap-start snap-always flex-shrink-0"
          >
            <VineCard
              event={event}
              isActive={i === activeIndex}
              isNearActive={Math.abs(i - activeIndex) <= 1}
              onCommentClick={handleCommentClick}
            />
          </div>
        ))}
      </div>

      {/* ── Comments sheet ───────────────────────────────────────────── */}
      <CommentsSheet
        event={activeVine}
        open={commentsOpen}
        onClose={() => setCommentsOpen(false)}
      />
    </div>
  );
}

// ─── VinesTabBar ─────────────────────────────────────────────────────────────

interface VinesTabBarProps {
  tab: FeedTab;
  onTabChange: (tab: FeedTab) => void;
  hasUser: boolean;
}

function VinesTabBar({ tab, onTabChange, hasUser }: VinesTabBarProps) {
  return (
    <div className="flex border-b border-border sticky top-mobile-bar sidebar:top-0 bg-background/80 backdrop-blur-md z-10 shrink-0">
      {hasUser && (
        <VinesTabButton label="Follows" active={tab === 'follows'} onClick={() => onTabChange('follows')} />
      )}
      <VinesTabButton label="Global" active={tab === 'global'} onClick={() => onTabChange('global')} />
    </div>
  );
}

function VinesTabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex-1 py-3.5 sidebar:py-5 text-center text-sm font-medium sidebar:font-semibold transition-colors relative hover:bg-secondary/40',
        active ? 'text-foreground' : 'text-muted-foreground',
      )}
    >
      {label}
      {active && (
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-16 h-1 sidebar:h-[3px] bg-primary rounded-full" />
      )}
    </button>
  );
}

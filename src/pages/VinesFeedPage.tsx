import {
  useRef,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from 'react';
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
  ChevronLeft,
} from 'lucide-react';

import type { NostrEvent } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { useStreamKind } from '@/hooks/useStreamKind';
import { useAuthor } from '@/hooks/useAuthor';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useEventStats } from '@/hooks/useTrending';
import { useAppContext } from '@/hooks/useAppContext';
import { useBlossomFallback } from '@/hooks/useBlossomFallback';
import { useLayoutOptions } from '@/contexts/LayoutContext';
import { useFollowList } from '@/hooks/useFollowActions';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useUserReaction } from '@/hooks/useUserReaction';
import { RepostMenu } from '@/components/RepostMenu';
import { RepostIcon } from '@/components/icons/RepostIcon';
import { ZapDialog } from '@/components/ZapDialog';
import { NoteMoreMenu } from '@/components/NoteMoreMenu';
import { ProfileHoverCard } from '@/components/ProfileHoverCard';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';


import { ReplyComposeModal } from '@/components/ReplyComposeModal';
import { ComposeBox } from '@/components/ComposeBox';
import { getDisplayName } from '@/lib/getDisplayName';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { canZap } from '@/lib/canZap';
import { timeAgo } from '@/lib/timeAgo';
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

// ─── Hook: fetch replies for the active vine ──────────────────────────────────

function useVineReplies(event: NostrEvent | undefined) {
  const { nostr } = useNostr();

  const eventId = event?.id;
  const aTag = event
    ? `${event.kind}:${event.pubkey}:${getTag(event.tags, 'd') ?? ''}`
    : undefined;

  return useQuery<NostrEvent[]>({
    queryKey: ['vine-replies', aTag ?? ''],
    queryFn: async ({ signal }) => {
      if (!eventId || !aTag) return [];
      const abort = AbortSignal.any([signal, AbortSignal.timeout(5000)]);
      // Kind 34236 is addressable — use NIP-22 kind 1111 comments only (#A tag)
      const events = await nostr.query(
        [{ kinds: [1111, 1244], '#A': [aTag], limit: 80 }],
        { signal: abort },
      );
      const seen = new Set<string>();
      return events
        .filter((e) => { if (seen.has(e.id)) return false; seen.add(e.id); return true; })
        .sort((a, b) => b.created_at - a.created_at);
    },
    enabled: !!eventId,
    staleTime: 15 * 1000,
    refetchInterval: 20 * 1000,
  });
}

// ─── VinesCommentsContent ────────────────────────────────────────────────────

interface VinesCommentsContentProps {
  activeVine: NostrEvent | undefined;
}

function VinesCommentsContent({ activeVine }: VinesCommentsContentProps) {
  const { data: rawReplies = [], isLoading } = useVineReplies(activeVine);
  // Deduplicate at render time as a safety net against relay returning duplicates
  const replies = useMemo(() => {
    const seen = new Set<string>();
    return rawReplies.filter((e) => seen.has(e.id) ? false : (seen.add(e.id), true));
  }, [rawReplies]);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto py-2 sidebar:pt-6">
        {!activeVine ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-muted-foreground text-sm text-center px-6">
              Select a vine to see comments
            </p>
          </div>
        ) : isLoading ? (
          <div className="space-y-3 px-4 py-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <CommentSkeleton key={i} />
            ))}
          </div>
        ) : replies.length === 0 ? (
          <div className="flex items-center justify-center h-32">
            <p className="text-muted-foreground text-sm text-center px-6">
              No comments yet. Be the first!
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {replies.map((reply) => (
              <CommentRow key={reply.id} event={reply} />
            ))}
          </div>
        )}
      </div>
  );
}

// ─── VinesCommentsSidebar ────────────────────────────────────────────────────

interface VinesCommentsSidebarProps {
  activeVine: NostrEvent | undefined;
}

function VinesCommentsSidebar({ activeVine }: VinesCommentsSidebarProps) {
  return (
    <aside className="w-[320px] shrink-0 hidden xl:flex flex-col sticky top-0 h-screen border-l border-border bg-background">
      <div className="px-4 pt-4 pb-1">
        <h2 className="text-xl font-bold text-foreground">Replies</h2>
      </div>
      <VinesCommentsContent activeVine={activeVine} />
    </aside>
  );
}



function CommentRow({ event }: { event: NostrEvent }) {
  const author = useAuthor(event.pubkey);
  const metadata = author.data?.metadata;
  const displayName = getDisplayName(metadata, event.pubkey);
  const profileUrl = useProfileUrl(event.pubkey, metadata);

  return (
    <div className="flex gap-2.5 px-4 py-2.5 hover:bg-muted/30 transition-colors">
      <ProfileHoverCard pubkey={event.pubkey} asChild>
        <Link to={profileUrl} className="shrink-0">
          {author.isLoading ? (
            <Skeleton className="size-7 rounded-full" />
          ) : (
            <Avatar className="size-7">
              <AvatarImage src={metadata?.picture} alt={displayName} />
              <AvatarFallback className="text-[10px] bg-primary/20 text-primary">
                {displayName[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
          )}
        </Link>
      </ProfileHoverCard>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-1.5 mb-0.5">
          <ProfileHoverCard pubkey={event.pubkey} asChild>
            <Link to={profileUrl} className="text-xs font-semibold hover:underline truncate max-w-[120px]">
              {displayName}
            </Link>
          </ProfileHoverCard>
          <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(event.created_at)}</span>
        </div>
        <p className="text-xs text-foreground/90 leading-relaxed break-words line-clamp-4">
          {event.content}
        </p>
      </div>
    </div>
  );
}

function CommentSkeleton() {
  return (
    <div className="flex gap-2.5 px-4 py-2.5">
      <Skeleton className="size-7 rounded-full shrink-0" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-3/4" />
      </div>
    </div>
  );
}

// ─── VineHeartButton ─────────────────────────────────────────────────────────

export function VineHeartButton({ event, label }: { event: NostrEvent; label?: string }) {
  const { user } = useCurrentUser();
  const userReaction = useUserReaction(event.id);
  const { mutate: publishEvent } = useNostrPublish();
  const hasReacted = !!userReaction;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user || hasReacted) return;
    publishEvent({ kind: 7, content: '+', tags: [['e', event.id], ['p', event.pubkey], ['k', String(event.kind)]] });
  };

  return (
    <VineActionButton label={label}>
      <button
        className={cn(
          'size-11 rounded-full flex items-center justify-center transition-colors backdrop-blur-sm bg-black/20 hover:bg-white/10',
          hasReacted ? 'text-pink-500' : 'text-white hover:text-pink-400',
        )}
        onClick={handleClick}
      >
        <Heart className="size-6" fill={hasReacted ? 'currentColor' : 'none'} />
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
  const displayName = getDisplayName(metadata, event.pubkey);
  const profileUrl = useProfileUrl(event.pubkey, metadata);
  const { data: stats } = useEventStats(event.id);
  const canZapAuthor = user && canZap(metadata);

  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [isAttemptingPlay, setIsAttemptingPlay] = useState(isActive);
  const [isMuted, setIsMuted] = useState(globalMuted);

  const videoRef = useRef<HTMLVideoElement>(null);

  const imeta = useMemo(() => parseVineImeta(event.tags), [event.tags]);
  const title = getTag(event.tags, 'title');
  const hashtags = event.tags.filter(([n]) => n === 't').map(([, v]) => v);

  const { src, onError: onBlossomError } = useBlossomFallback(imeta.url ?? '');

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
            poster={imeta.thumbnail}
            className="absolute inset-0 w-full h-full object-cover"
            loop
            playsInline
            muted={isMuted}
            preload={isActive ? 'auto' : isNearActive ? 'metadata' : 'none'}
            onPlay={() => { setIsPlaying(true); setHasStarted(true); setIsAttemptingPlay(false); }}
            onPause={() => { setIsPlaying(false); setIsAttemptingPlay(false); }}
            onError={onBlossomError}
            onClick={togglePlay}
          />

          {/* Big play overlay before first play — hidden while autoplay is attempting */}
          {!hasStarted && !isAttemptingPlay && (
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
          {hasStarted && !isPlaying && (
            <div
              className="absolute inset-0 flex items-center justify-center cursor-pointer"
              onClick={togglePlay}
            >
              <div className="size-16 rounded-full bg-black/40 flex items-center justify-center backdrop-blur-sm border border-white/20 animate-in zoom-in-50 duration-150">
                <Play className="size-8 text-white ml-1" fill="white" />
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="absolute inset-0 bg-neutral-900 flex items-center justify-center">
          <span className="text-white/40 text-sm">No video</span>
        </div>
      )}

      {/* ── Gradient overlays ────────────────────────────────────────── */}
      <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/60 to-transparent pointer-events-none" />
      <div className="absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-black/90 via-black/40 to-transparent pointer-events-none" />

      {/* ── Mute toggle (top-right) ───────────────────────────────────── */}
      <button
        className="absolute top-4 right-4 z-10 size-9 rounded-full bg-black/40 backdrop-blur-sm border border-white/20 flex items-center justify-center text-white hover:bg-black/60 transition-colors"
        onClick={toggleMute}
        aria-label={isMuted ? 'Unmute' : 'Mute'}
      >
        {isMuted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
      </button>

      {/* ── Right action sidebar ──────────────────────────────────────── */}
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
              <Avatar className="size-11 border-2 border-white shadow-lg">
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
        <RepostMenu event={event}>
          {(isReposted: boolean) => (
            <VineActionButton
              icon={<RepostIcon className="size-6" />}
              label={(stats?.reposts || stats?.quotes) ? String((stats?.reposts ?? 0) + (stats?.quotes ?? 0)) : undefined}
              className={isReposted ? 'text-accent' : 'text-white hover:text-accent'}
            />
          )}
        </RepostMenu>

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

      {/* ── Bottom info strip ────────────────────────────────────────── */}
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

  // Default to follows when logged in, global when logged out
  const [tab, setTab] = useState<FeedTab>(user ? 'follows' : 'global');

  // Switch to follows when user logs in for the first time this session
  const didSwitchRef = useRef(false);
  useEffect(() => {
    if (user && !didSwitchRef.current) {
      didSwitchRef.current = true;
      setTab('follows');
    }
  }, [user]);

  const { events, isLoading } = useVinesFeed(tab);
  const [activeIndex, setActiveIndex] = useState(0);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleCommentClick = useCallback(() => {
    if (window.innerWidth >= 1280) {
      setReplyOpen(true);
    } else {
      setCommentsOpen(true);
    }
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

  // Inject comments sidebar as the right sidebar; suppress the bottom spacer
  // so the bottom nav doesn't double-count in the height calculation.
  useLayoutOptions({
    showFAB: false,
    noBottomSpacer: true,
    rightSidebar: <VinesCommentsSidebar activeVine={activeVine} />,
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
          <div className="text-center space-y-3 px-8">
            <p className="text-lg font-semibold">No vines yet</p>
            <p className="text-muted-foreground text-sm">
              {tab === 'follows'
                ? 'None of the people you follow have posted vines. Try Global.'
                : 'Short-form videos will appear here. Check back soon!'}
            </p>
            {tab === 'follows' && (
              <button
                className="text-sm text-primary hover:underline"
                onClick={() => setTab('global')}
              >
                Switch to Global
              </button>
            )}
          </div>
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
        ref={containerRef}
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

      {/* ── Mobile comments panel — full overlay, xl:hidden ─────────── */}
      {commentsOpen && (
        <div className="xl:hidden fixed inset-x-0 top-12 bottom-0 z-30 flex flex-col bg-background/80 backdrop-blur-md overflow-hidden">
          {/* Compose with back button baked in above it */}
          {activeVine && (
            <div className="border-b border-border shrink-0">
              <div className="flex items-center gap-1 px-4 pt-2">
                <button
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setCommentsOpen(false)}
                >
                  <ChevronLeft className="size-3.5" />
                  Back
                </button>
              </div>
              <ComposeBox replyTo={activeVine} compact placeholder="Add a comment…" />
            </div>
          )}
          <VinesCommentsContent activeVine={activeVine} />
        </div>
      )}

      {/* ── Reply modal ──────────────────────────────────────────────── */}
      {activeVine && (
        <ReplyComposeModal
          event={activeVine}
          open={replyOpen}
          onOpenChange={setReplyOpen}
        />
      )}
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

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
} from 'lucide-react';
import { nip19 } from 'nostr-tools';
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
import { ReactionButton } from '@/components/ReactionButton';
import { RepostMenu } from '@/components/RepostMenu';
import { RepostIcon } from '@/components/icons/RepostIcon';
import { ZapDialog } from '@/components/ZapDialog';
import { NoteMoreMenu } from '@/components/NoteMoreMenu';
import { ProfileHoverCard } from '@/components/ProfileHoverCard';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { DittoLogo } from '@/components/DittoLogo';
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

function encodeVineId(event: NostrEvent): string {
  const d = getTag(event.tags, 'd');
  if (d) return nip19.naddrEncode({ kind: event.kind, pubkey: event.pubkey, identifier: d });
  return nip19.neventEncode({ id: event.id, author: event.pubkey });
}

// ─── Global mute state shared across vine cards ───────────────────────────────
let globalMuted = true;

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

function useVineReplies(eventId: string | undefined) {
  const { nostr } = useNostr();
  return useQuery<NostrEvent[]>({
    queryKey: ['vine-replies', eventId ?? ''],
    queryFn: async ({ signal }) => {
      if (!eventId) return [];
      const events = await nostr.query(
        [{ kinds: [1], '#e': [eventId], limit: 80 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) },
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
  const { data: replies = [], isLoading } = useVineReplies(activeVine?.id);

  return (
    <>
      {/* Comment list */}
      <div className="flex-1 overflow-y-auto py-2">
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

      {/* Compose */}
      {activeVine && (
        <div className="border-t border-border">
          <ComposeBox replyTo={activeVine} compact placeholder="Add a comment…" />
        </div>
      )}
    </>
  );
}

// ─── VinesCommentsSidebar ────────────────────────────────────────────────────

interface VinesCommentsSidebarProps {
  activeVine: NostrEvent | undefined;
}

function VinesCommentsSidebar({ activeVine }: VinesCommentsSidebarProps) {
  return (
    <aside className="w-[320px] shrink-0 hidden xl:flex flex-col sticky top-0 h-screen border-l border-border bg-background">
      <VinesCommentsContent activeVine={activeVine} />
    </aside>
  );
}

// ─── VinesMobileComments ──────────────────────────────────────────────────────

function VinesMobileComments({ activeVine }: { activeVine: NostrEvent | undefined }) {
  return (
    <div className="flex flex-col h-full">
      <VinesCommentsContent activeVine={activeVine} />
    </div>
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

// ─── VineCard ────────────────────────────────────────────────────────────────

interface VineCardProps {
  event: NostrEvent;
  isActive: boolean;
  onCommentClick: () => void;
}

function VineCard({ event, isActive, onCommentClick }: VineCardProps) {
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
      video.play().catch(() => {
        // Autoplay blocked — leave paused, user can tap
      });
    } else {
      video.pause();
      video.currentTime = 0;
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
    globalMuted = next;
    setIsMuted(next);
  }, []);

  return (
    <div className="relative w-full h-full bg-black overflow-hidden flex-shrink-0">
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
            preload="metadata"
            onPlay={() => { setIsPlaying(true); setHasStarted(true); }}
            onPause={() => setIsPlaying(false)}
            onError={onBlossomError}
            onClick={togglePlay}
          />

          {/* Big play overlay before first play */}
          {!hasStarted && (
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
        <VineActionButton>
          <ReactionButton
            eventId={event.id}
            eventPubkey={event.pubkey}
            eventKind={event.kind}
            reactionCount={stats?.reactions}
            className="text-white hover:text-pink-400 hover:bg-white/10 size-11 rounded-full flex items-center justify-center p-0"
          />
        </VineActionButton>

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

interface VineActionButtonProps {
  icon?: React.ReactNode;
  label?: string;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  className?: string;
  children?: React.ReactNode;
}

function VineActionButton({ icon, label, onClick, className, children }: VineActionButtonProps) {
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
  const containerRef = useRef<HTMLDivElement>(null);

  useSeoMeta({
    title: `Vines | ${config.appName}`,
    description: 'Short-form videos on Nostr',
  });

  // Filter to events that have a video URL
  const vines = useMemo(
    () => events.filter((e) => !!parseVineImeta(e.tags).url),
    [events],
  );

  // Reset active index when tab or vine list changes significantly
  useEffect(() => {
    setActiveIndex(0);
    const container = containerRef.current;
    if (container) container.scrollTop = 0;
  }, [tab]);

  const activeVine = vines[activeIndex];

  // Inject comments sidebar as the right sidebar; suppress the bottom spacer
  // so the bottom nav doesn't double-count in the height calculation.
  useLayoutOptions({
    showFAB: false,
    noBottomSpacer: true,
    rightSidebar: <VinesCommentsSidebar activeVine={activeVine} />,
  });

  // Snap-scroll to a specific vine index
  const scrollToIndex = useCallback((index: number) => {
    const container = containerRef.current;
    if (!container) return;
    const target = container.children[index] as HTMLElement | undefined;
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  // Update active index based on intersection
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

    const kids = Array.from(container.children);
    kids.forEach((child) => observer.observe(child));
    return () => observer.disconnect();
  }, [vines]);

  // Keyboard arrow navigation
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = Math.min(activeIndex + 1, vines.length - 1);
        setActiveIndex(next);
        scrollToIndex(next);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = Math.max(activeIndex - 1, 0);
        setActiveIndex(prev);
        scrollToIndex(prev);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [activeIndex, vines.length, scrollToIndex]);

  // ── Loading state ────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex-1 min-w-0 flex flex-col h-[calc(100dvh-3rem-3.5rem)] sidebar:h-screen">
        <VinesTabBar tab={tab} onTabChange={setTab} hasUser={!!user} />
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-6">
            <DittoLogo size={48} />
            <div className="size-6 rounded-full border-[2.5px] border-primary/25 border-t-primary animate-spin" />
          </div>
        </div>
      </div>
    );
  }

  // ── Empty state ──────────────────────────────────────────────────────────
  if (!isLoading && vines.length === 0) {
    return (
      <div className="flex-1 min-w-0 flex flex-col h-[calc(100dvh-3rem-3.5rem)] sidebar:h-screen">
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
      <div className="relative flex-1">
        <div
          ref={containerRef}
          className="h-[calc(100dvh-9.5rem)] sidebar:h-[calc(100vh-3rem)] overflow-y-scroll snap-y snap-mandatory"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {vines.map((event, i) => (
            <div
              key={event.id}
              className="w-full h-[calc(100dvh-9.5rem)] sidebar:h-[calc(100vh-3rem)] snap-start snap-always flex-shrink-0"
            >
              <VineCard
                event={event}
                isActive={i === activeIndex}
                onCommentClick={() => setCommentsOpen(true)}
              />
            </div>
          ))}
        </div>
      </div>

      {/* ── Mobile comments sheet ───────────────────────────────────── */}
      <Sheet open={commentsOpen} onOpenChange={setCommentsOpen}>
        <SheetContent side="bottom" className="xl:hidden h-[75dvh] p-0 flex flex-col rounded-t-2xl">
          <VinesMobileComments activeVine={activeVine} />
        </SheetContent>
      </Sheet>
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
    <div className="flex h-12 border-b border-border sticky top-mobile-bar sidebar:top-0 bg-background/80 backdrop-blur-md z-10 shrink-0">
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
        'flex-1 h-full text-center text-sm font-medium transition-colors relative hover:bg-secondary/40',
        active ? 'text-foreground' : 'text-muted-foreground',
      )}
    >
      {label}
      {active && (
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-16 h-1 bg-primary rounded-full" />
      )}
    </button>
  );
}

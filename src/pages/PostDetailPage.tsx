import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, MessageCircle, Repeat2, Zap, MoreHorizontal } from 'lucide-react';
import { nip19 } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';
import { useSeoMeta } from '@unhead/react';

import { MainLayout } from '@/components/MainLayout';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { NoteContent } from '@/components/NoteContent';
import { VideoPlayer } from '@/components/VideoPlayer';
import { ImageGallery } from '@/components/ImageGallery';
import { NoteCard } from '@/components/NoteCard';
import { NoteMoreMenu } from '@/components/NoteMoreMenu';
import { ReplyComposeModal } from '@/components/ReplyComposeModal';
import { ReactionButton } from '@/components/ReactionButton';
import { InteractionsModal, type InteractionTab } from '@/components/InteractionsModal';
import { ZapDialog } from '@/components/ZapDialog';
import { PollContent } from '@/components/PollContent';
import { GeocacheContent } from '@/components/GeocacheContent';
import { FoundLogContent } from '@/components/FoundLogContent';
import { ColorMomentContent } from '@/components/ColorMomentContent';
import { FollowPackContent } from '@/components/FollowPackContent';
import { FollowPackDetailContent } from '@/components/FollowPackDetailContent';
import { useEvent, useAddrEvent, type AddrCoords } from '@/hooks/useEvent';

/** Kinds that get the full follow-pack detail view. */
const FOLLOW_PACK_KINDS = new Set([30000, 39089]);
import { useReplies } from '@/hooks/useReplies';
import { useAuthor } from '@/hooks/useAuthor';
import { useEventStats } from '@/hooks/useTrending';
import { genUserName } from '@/lib/genUserName';
import { timeAgo } from '@/lib/timeAgo';
import NotFound from './NotFound';

interface PostDetailPageProps {
  eventId: string;
}

interface AddrPostDetailPageProps {
  addr: AddrCoords;
}

/** Formats a sats amount into a compact human-readable string. */
function formatSats(sats: number): string {
  if (sats >= 1_000_000) return `${(sats / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (sats >= 1_000) return `${(sats / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return sats.toString();
}

/** Extracts image URLs from note content. */
function extractImages(content: string): string[] {
  const urlRegex = /https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp|svg)(\?[^\s]*)?/gi;
  return content.match(urlRegex) || [];
}

/** Extracts video URLs from note content. */
function extractVideos(content: string): string[] {
  const urlRegex = /https?:\/\/[^\s]+\.(mp4|webm|mov)(\?[^\s]*)?/gi;
  return content.match(urlRegex) || [];
}

/** Parsed imeta entry. */
interface ImetaEntry {
  url: string;
  thumbnail?: string;
}

/** Parse all imeta tags into a map keyed by URL. */
function parseImetaMap(tags: string[][]): Map<string, ImetaEntry> {
  const map = new Map<string, ImetaEntry>();
  for (const tag of tags) {
    if (tag[0] !== 'imeta') continue;
    const entry: Record<string, string> = {};
    for (let i = 1; i < tag.length; i++) {
      const part = tag[i];
      const spaceIdx = part.indexOf(' ');
      if (spaceIdx === -1) continue;
      const key = part.slice(0, spaceIdx);
      const value = part.slice(spaceIdx + 1);
      entry[key] = value;
    }
    if (entry.url) {
      map.set(entry.url, { url: entry.url, thumbnail: entry.image });
    }
  }
  return map;
}

/** Formats a timestamp into a full date string like "Feb 16, 2026, 2:53 PM". */
function formatFullDate(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Extracts the parent (replied-to) event ID from an event's tags following NIP-10 conventions.
 * Supports both the preferred marked-tag scheme and the deprecated positional scheme.
 */
function getParentEventId(event: NostrEvent): string | undefined {
  const eTags = event.tags.filter(([name]) => name === 'e');
  if (eTags.length === 0) return undefined;

  // Preferred: look for marked "reply" tag first
  const replyTag = eTags.find(([, , , marker]) => marker === 'reply');
  if (replyTag) return replyTag[1];

  // If there's a "root" marker but no "reply" marker, the event replies directly to root
  const rootTag = eTags.find(([, , , marker]) => marker === 'root');
  if (rootTag) return rootTag[1];

  // Deprecated positional scheme: last e-tag is the reply target
  if (eTags.length >= 1) return eTags[eTags.length - 1][1];

  return undefined;
}

export function PostDetailPage({ eventId }: PostDetailPageProps) {
  const { data: event, isLoading, isError } = useEvent(eventId);

  useSeoMeta({
    title: event ? 'Post Details - Mew' : 'Loading... - Mew',
  });

  if (isLoading) {
    return (
      <MainLayout>
        <PostDetailShell>
          <PostDetailSkeleton />
        </PostDetailShell>
      </MainLayout>
    );
  }

  if (isError || !event) {
    return <NotFound />;
  }

  return (
    <MainLayout>
      <PostDetailShell>
        <PostDetailContent event={event} />
      </PostDetailShell>
    </MainLayout>
  );
}

/** Detail page for addressable events (naddr). Same layout as PostDetailPage. */
export function AddrPostDetailPage({ addr }: AddrPostDetailPageProps) {
  const { data: event, isLoading, isError } = useAddrEvent(addr);

  useSeoMeta({
    title: event
      ? `${event.tags.find(([n]) => n === 'title')?.[1] || 'Post Details'} - Mew`
      : 'Loading... - Mew',
  });

  if (isLoading) {
    return (
      <MainLayout>
        <PostDetailShell>
          <PostDetailSkeleton />
        </PostDetailShell>
      </MainLayout>
    );
  }

  if (isError || !event) {
    return <NotFound />;
  }

  // Follow packs get their own full detail view with member list + Follow All
  if (FOLLOW_PACK_KINDS.has(event.kind)) {
    return (
      <MainLayout>
        <PostDetailShell>
          <FollowPackDetailContent event={event} />
        </PostDetailShell>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <PostDetailShell>
        <PostDetailContent event={event} />
      </PostDetailShell>
    </MainLayout>
  );
}

function PostDetailShell({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();

  return (
    <main className="flex-1 min-w-0 sidebar:max-w-[600px] sidebar:border-l xl:border-r border-border min-h-screen">
      {/* Header — matches Ditto: ← Post Details */}
      <div className="sticky top-10 sidebar:top-0 z-10 flex items-center gap-4 px-4 h-20 bg-background/80 backdrop-blur-md">
        <button
          onClick={() => navigate(-1)}
          className="p-1.5 -ml-1.5 rounded-full hover:bg-secondary/60 transition-colors"
          aria-label="Go back"
        >
          <ArrowLeft className="size-5" />
        </button>
        <h1 className="text-xl font-bold">Post Details</h1>
      </div>

      {children}
    </main>
  );
}

function PostDetailContent({ event }: { event: NostrEvent }) {
  const author = useAuthor(event.pubkey);
  const metadata = author.data?.metadata;
  const displayName = metadata?.name || genUserName(event.pubkey);
  const nip05 = metadata?.nip05;
  const npub = useMemo(() => nip19.npubEncode(event.pubkey), [event.pubkey]);

    // Kind detection — mirrors NoteCard
    const isVine = event.kind === 34236;
    const isPoll = event.kind === 1068;
    const isGeocache = event.kind === 37516;
    const isFoundLog = event.kind === 7516;
    const isColor = event.kind === 3367;
    const isFollowPack = event.kind === 39089 || event.kind === 30000;
    const isTextNote = !isVine && !isPoll && !isGeocache && !isFoundLog && !isColor && !isFollowPack;

  const images = useMemo(() => isTextNote ? extractImages(event.content) : [], [event.content, isTextNote]);
  const videos = useMemo(() => isTextNote ? extractVideos(event.content) : [], [event.content, isTextNote]);
  const imetaMap = useMemo(() => isTextNote ? parseImetaMap(event.tags) : new Map<string, ImetaEntry>(), [event.tags, isTextNote]);
  const { data: stats } = useEventStats(event.id);
  const { data: replies, isLoading: repliesLoading } = useReplies(event.id);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);
  const [interactionsOpen, setInteractionsOpen] = useState(false);
  const [interactionsTab, setInteractionsTab] = useState<InteractionTab>('reposts');

  const parentEventId = useMemo(() => isTextNote ? getParentEventId(event) : undefined, [event, isTextNote]);

  const openInteractions = (tab: InteractionTab) => {
    setInteractionsTab(tab);
    setInteractionsOpen(true);
  };

  const repostTotal = (stats?.reposts ?? 0) + (stats?.quotes ?? 0);
  const hasStats = !!(repostTotal || stats?.reactions || stats?.zapAmount);

  return (
    <div>
      {/* Parent event if this is a reply */}
      {parentEventId && <ParentNote eventId={parentEventId} />}

      {/* Main post — expanded Ditto-style view */}
      <article className="px-4 pt-3 pb-0">
        {/* Author row */}
        <div className="flex items-center gap-3">
          {author.isLoading ? (
            <>
              <Skeleton className="size-11 rounded-full shrink-0" />
              <div className="flex-1 min-w-0 space-y-1.5">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-36" />
              </div>
            </>
          ) : (
            <>
              <Link to={`/${npub}`}>
                <Avatar className="size-11">
                  <AvatarImage src={metadata?.picture} alt={displayName} />
                  <AvatarFallback className="bg-primary/20 text-primary text-sm">
                    {displayName[0].toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </Link>

              <div className="flex-1 min-w-0">
                <Link to={`/${npub}`} className="font-bold text-[15px] hover:underline block truncate">
                  {displayName}
                </Link>
                {nip05 && (
                  <span className="text-sm text-muted-foreground truncate block">
                    @{nip05}
                  </span>
                )}
              </div>

              {metadata?.bot && (
                <span className="text-sm text-primary" title="Bot account">🤖</span>
              )}
            </>
          )}
        </div>

        {/* Post content — kind-based dispatch (same as NoteCard) */}
        {isVine || isPoll || isGeocache || isFoundLog || isColor || isFollowPack ? (
          <>
            {isPoll && <PollContent event={event} />}
            {isGeocache && <GeocacheContent event={event} />}
            {isFoundLog && <FoundLogContent event={event} />}
            {isColor && <ColorMomentContent event={event} />}
            {isFollowPack && <FollowPackContent event={event} />}
          </>
        ) : (
          <>
            <div className="mt-3">
              <NoteContent event={event} className="text-[15px] leading-relaxed" />
            </div>
            {videos.map((url, i) => (
              <VideoPlayer key={`v-${i}`} src={url} poster={imetaMap.get(url)?.thumbnail} />
            ))}
            <ImageGallery images={images} maxGridHeight="500px" />
          </>
        )}

        {/* Stats row: "2 Reposts 1 👍" left, "Feb 16, 2026, 6:44 PM" right — Ditto style */}
        {hasStats && (
          <div className="flex items-center gap-x-3 py-2.5 mt-3 text-sm text-muted-foreground">
            {repostTotal ? (
              <button
                onClick={() => openInteractions('reposts')}
                className="hover:underline transition-colors"
              >
                <span className="font-bold text-foreground">{repostTotal}</span>{' '}
                Repost{repostTotal !== 1 ? 's' : ''}
              </button>
            ) : null}
            {stats?.reactions ? (
              <button
                onClick={() => openInteractions('reactions')}
                className="hover:underline transition-colors"
              >
                <span className="font-bold text-foreground">{stats.reactions}</span>{' '}
                {stats.reactionEmojis && stats.reactionEmojis.length > 0
                  ? stats.reactionEmojis.slice(0, 3).join('')
                  : `Like${stats.reactions !== 1 ? 's' : ''}`}
              </button>
            ) : null}
            {stats?.zapAmount ? (
              <button
                onClick={() => openInteractions('zaps')}
                className="hover:underline transition-colors"
              >
                <span className="font-bold text-foreground">{formatSats(stats.zapAmount)}</span>{' '}
                sats
              </button>
            ) : null}
            <span className="ml-auto shrink-0">{formatFullDate(event.created_at)}</span>
          </div>
        )}

        {/* Date-only row if no stats */}
        {!hasStats && (
          <div className="py-2.5 mt-3 text-sm text-muted-foreground">
            {formatFullDate(event.created_at)}
          </div>
        )}

        {/* Action buttons — Ditto style: distributed across full width */}
        <div className="flex items-center justify-between py-1 border-t border-b border-border -mx-4 px-4">
          {/* Reply */}
          <button
            className="flex items-center gap-1.5 p-2 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
            title="Reply"
            onClick={() => setReplyOpen(true)}
          >
            <MessageCircle className="size-[18px]" />
            {stats?.replies ? <span className="text-xs">{stats.replies}</span> : null}
          </button>

          {/* Repost */}
          <button
            className="flex items-center gap-1.5 p-2 rounded-full text-muted-foreground hover:text-green-500 hover:bg-green-500/10 transition-colors"
            title="Reposts"
            onClick={() => openInteractions('reposts')}
          >
            <Repeat2 className="size-[18px]" />
            {repostTotal ? <span className="text-xs">{repostTotal}</span> : null}
          </button>

          {/* React */}
          <ReactionButton
            eventId={event.id}
            eventPubkey={event.pubkey}
            eventKind={event.kind}
            reactionCount={stats?.reactions}
          />

          {/* Zap */}
          <ZapDialog target={event}>
            <button
              className="flex items-center gap-1.5 p-2 rounded-full text-muted-foreground hover:text-amber-500 hover:bg-amber-500/10 transition-colors"
              title="Zaps"
            >
              <Zap className="size-[18px]" />
              {stats?.zapAmount ? <span className="text-xs">{formatSats(stats.zapAmount)}</span> : null}
            </button>
          </ZapDialog>

          {/* More */}
          <button
            className="p-2 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
            title="More"
            onClick={() => setMoreMenuOpen(true)}
          >
            <MoreHorizontal className="size-[18px]" />
          </button>
        </div>

        <NoteMoreMenu event={event} open={moreMenuOpen} onOpenChange={setMoreMenuOpen} />
        <ReplyComposeModal event={event} open={replyOpen} onOpenChange={setReplyOpen} />
        <InteractionsModal
          eventId={event.id}
          open={interactionsOpen}
          onOpenChange={setInteractionsOpen}
          initialTab={interactionsTab}
        />
      </article>

      {/* Replies */}
      <div>
        {repliesLoading ? (
          <div className="divide-y divide-border">
            {Array.from({ length: 3 }).map((_, i) => (
              <ReplyCardSkeleton key={i} />
            ))}
          </div>
        ) : replies && replies.length > 0 ? (
          replies.map((reply) => (
            <NoteCard key={reply.id} event={reply} />
          ))
        ) : (
          <div className="py-12 text-center text-muted-foreground text-sm">
            No replies yet. Be the first to reply!
          </div>
        )}
      </div>
    </div>
  );
}

/** Renders the parent event that this reply is responding to. */
function ParentNote({ eventId }: { eventId: string }) {
  const navigate = useNavigate();
  const { data: event, isLoading } = useEvent(eventId);
  const author = useAuthor(event?.pubkey);
  const metadata = author.data?.metadata;
  const displayName = event ? (metadata?.name || genUserName(event.pubkey)) : '';
  const npub = useMemo(
    () => event ? nip19.npubEncode(event.pubkey) : '',
    [event],
  );
  const neventId = useMemo(
    () => event ? nip19.neventEncode({ id: event.id, author: event.pubkey }) : '',
    [event],
  );

  if (isLoading) {
    return (
      <div className="px-4 pt-3 pb-0">
        <div className="flex gap-3">
          <div className="flex flex-col items-center">
            <Skeleton className="size-10 rounded-full shrink-0" />
            <div className="w-0.5 flex-1 mt-2 bg-border" />
          </div>
          <div className="flex-1 min-w-0 pb-4 space-y-2">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-16" />
            </div>
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!event) return null;

  return (
    <div
      className="px-4 pt-3 pb-0 cursor-pointer hover:bg-secondary/30 transition-colors"
      onClick={() => navigate(`/${neventId}`)}
    >
      <div className="flex gap-3">
        {/* Avatar + thread connector line */}
        <div className="flex flex-col items-center">
          {author.isLoading ? (
            <Skeleton className="size-10 rounded-full shrink-0" />
          ) : (
            <Link
              to={`/${npub}`}
              className="shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              <Avatar className="size-10">
                <AvatarImage src={metadata?.picture} alt={displayName} />
                <AvatarFallback className="bg-primary/20 text-primary text-sm">
                  {displayName[0]?.toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </Link>
          )}
          <div className="w-0.5 flex-1 mt-2 bg-border rounded-full" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 pb-4">
          {/* Author row */}
          <div className="flex items-center gap-1.5 min-w-0">
            {author.isLoading ? (
              <>
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-16" />
              </>
            ) : (
              <>
                <Link
                  to={`/${npub}`}
                  className="font-bold text-[15px] hover:underline truncate"
                  onClick={(e) => e.stopPropagation()}
                >
                  {displayName}
                </Link>
                {metadata?.nip05 && (
                  <>
                    <span className="text-sm text-muted-foreground truncate">
                      @{metadata.nip05}
                    </span>
                    <span className="text-sm text-muted-foreground shrink-0">·</span>
                  </>
                )}
                <span className="text-sm text-muted-foreground shrink-0">
                  {timeAgo(event.created_at)}
                </span>
              </>
            )}
          </div>

          {/* Note text */}
          <div className="mt-1">
            <NoteContent event={event} className="text-[15px] leading-relaxed" />
          </div>
        </div>
      </div>
    </div>
  );
}

function PostDetailSkeleton() {
  return (
    <div>
      <div className="px-4 pt-3 pb-0">
        {/* Author */}
        <div className="flex items-center gap-3">
          <Skeleton className="size-11 rounded-full shrink-0" />
          <div className="flex-1 min-w-0 space-y-1.5">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-36" />
          </div>
        </div>

        {/* Content */}
        <div className="mt-3 space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-4 w-3/5" />
        </div>

        {/* Image placeholder */}
        <Skeleton className="mt-3 w-full h-64 rounded-2xl" />

        {/* Date / stats row */}
        <div className="flex items-center gap-3 py-2.5 mt-3">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-4 w-32 ml-auto" />
        </div>

        {/* Action buttons */}
        <div className="flex items-center justify-between py-2 border-t border-b border-border -mx-4 px-4">
          <Skeleton className="size-[34px] rounded-full" />
          <Skeleton className="size-[34px] rounded-full" />
          <Skeleton className="size-[34px] rounded-full" />
          <Skeleton className="size-[34px] rounded-full" />
          <Skeleton className="size-[34px] rounded-full" />
        </div>
      </div>

      {/* Replies skeleton */}
      <div className="divide-y divide-border">
        {Array.from({ length: 3 }).map((_, i) => (
          <ReplyCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

function ReplyCardSkeleton() {
  return (
    <div className="px-4 py-3">
      <div className="flex gap-3">
        <Skeleton className="size-10 rounded-full shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-3 w-6" />
          </div>
          <Skeleton className="h-3 w-24" />
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
          <div className="flex gap-12 mt-1">
            <Skeleton className="h-4 w-6" />
            <Skeleton className="h-4 w-6" />
            <Skeleton className="h-4 w-6" />
            <Skeleton className="h-4 w-6" />
          </div>
        </div>
      </div>
    </div>
  );
}

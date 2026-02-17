import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, MessageCircle, Repeat2, Heart, Zap, MoreHorizontal } from 'lucide-react';
import { nip19 } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';
import { useSeoMeta } from '@unhead/react';

import { MainLayout } from '@/components/MainLayout';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { NoteContent } from '@/components/NoteContent';
import { LinkPreview } from '@/components/LinkPreview';
import { NoteCard } from '@/components/NoteCard';
import { NoteMoreMenu } from '@/components/NoteMoreMenu';
import { ReplyComposeModal } from '@/components/ReplyComposeModal';
import { InteractionsModal, type InteractionTab } from '@/components/InteractionsModal';
import { useEvent } from '@/hooks/useEvent';
import { useReplies } from '@/hooks/useReplies';
import { useAuthor } from '@/hooks/useAuthor';
import { useEventStats } from '@/hooks/useTrending';
import { extractPreviewUrl } from '@/hooks/useLinkPreview';
import { genUserName } from '@/lib/genUserName';
import { cn } from '@/lib/utils';
import NotFound from './NotFound';

interface PostDetailPageProps {
  eventId: string;
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

function PostDetailShell({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();

  return (
    <main className="flex-1 min-w-0 sidebar:max-w-[600px] sidebar:border-l lg:border-r border-border min-h-screen">
      {/* Header — matches Ditto: ← Post Details */}
      <div className="sticky top-10 sidebar:top-0 z-10 flex items-center gap-4 px-4 h-[53px] bg-background/80 backdrop-blur-md">
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
  const images = useMemo(() => extractImages(event.content), [event.content]);
  const previewUrl = useMemo(() => extractPreviewUrl(event.content), [event.content]);
  const { data: stats } = useEventStats(event.id);
  const { data: replies, isLoading: repliesLoading } = useReplies(event.id);
  const [liked, setLiked] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);
  const [interactionsOpen, setInteractionsOpen] = useState(false);
  const [interactionsTab, setInteractionsTab] = useState<InteractionTab>('reposts');

  const openInteractions = (tab: InteractionTab) => {
    setInteractionsTab(tab);
    setInteractionsOpen(true);
  };

  const hasStats = !!(stats?.reposts || stats?.reactions || stats?.zapAmount);

  return (
    <div>
      {/* Main post — expanded Ditto-style view */}
      <article className="px-4 pt-3 pb-0">
        {/* Author row */}
        <div className="flex items-center gap-3">
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
        </div>

        {/* Post content */}
        <div className="mt-3">
          <NoteContent event={event} className="text-[15px] leading-relaxed" />
        </div>

        {/* Image attachments */}
        {images.length > 0 && (
          <div className={cn(
            'mt-3 rounded-2xl overflow-hidden border border-border',
            images.length > 1 && 'grid grid-cols-2 gap-0.5',
          )}>
            {images.slice(0, 4).map((url, i) => (
              <a
                key={i}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <img
                  src={url}
                  alt=""
                  className="w-full h-auto max-h-[500px] object-cover"
                  loading="lazy"
                />
              </a>
            ))}
          </div>
        )}

        {/* Link preview */}
        {previewUrl && (
          <LinkPreview url={previewUrl} className="mt-3" />
        )}

        {/* Stats row: "2 Reposts 1 👍" left, "Feb 16, 2026, 6:44 PM" right — Ditto style */}
        {hasStats && (
          <div className="flex items-center gap-x-3 py-2.5 mt-3 text-sm text-muted-foreground">
            {stats?.reposts ? (
              <button
                onClick={() => openInteractions('reposts')}
                className="hover:underline transition-colors"
              >
                <span className="font-bold text-foreground">{stats.reposts}</span>{' '}
                Repost{stats.reposts !== 1 ? 's' : ''}
              </button>
            ) : null}
            {stats?.reactions ? (
              <button
                onClick={() => openInteractions('reactions')}
                className="hover:underline transition-colors"
              >
                <span className="font-bold text-foreground">{stats.reactions}</span>{' '}
                {stats.reactionEmojis && stats.reactionEmojis.length > 0
                  ? stats.reactionEmojis.slice(0, 8).join('')
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
            {stats?.reposts ? <span className="text-xs">{stats.reposts}</span> : null}
          </button>

          {/* Like */}
          <button
            className={cn(
              'flex items-center gap-1.5 p-2 rounded-full transition-colors',
              liked
                ? 'text-pink-500'
                : 'text-muted-foreground hover:text-pink-500 hover:bg-pink-500/10',
            )}
            title="Reactions"
            onClick={() => {
              setLiked(!liked);
              openInteractions('reactions');
            }}
          >
            <Heart className={cn('size-[18px]', liked && 'fill-pink-500')} />
            {stats?.reactions ? <span className="text-xs">{stats.reactions}</span> : null}
          </button>

          {/* Zap */}
          <button
            className="flex items-center gap-1.5 p-2 rounded-full text-muted-foreground hover:text-amber-500 hover:bg-amber-500/10 transition-colors"
            title="Zaps"
            onClick={() => openInteractions('zaps')}
          >
            <Zap className="size-[18px]" />
            {stats?.zapAmount ? <span className="text-xs">{formatSats(stats.zapAmount)}</span> : null}
          </button>

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

function PostDetailSkeleton() {
  return (
    <div className="px-4 pt-3">
      {/* Author */}
      <div className="flex items-center gap-3">
        <Skeleton className="size-11 rounded-full" />
        <div className="space-y-1.5">
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

      {/* Stats */}
      <div className="flex gap-4 mt-3 pt-2.5">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-32 ml-auto" />
      </div>

      {/* Actions */}
      <div className="flex justify-between py-2 mt-0 border-t border-b border-border">
        <Skeleton className="h-5 w-8" />
        <Skeleton className="h-5 w-8" />
        <Skeleton className="h-5 w-8" />
        <Skeleton className="h-5 w-8" />
        <Skeleton className="h-5 w-5" />
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

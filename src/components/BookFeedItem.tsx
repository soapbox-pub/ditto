import { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, MessageCircle, MessageSquare, MoreHorizontal, Star, Zap, AlertTriangle } from 'lucide-react';
import { nip19 } from 'nostr-tools';
import { RepostIcon } from '@/components/icons/RepostIcon';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { getAvatarShape } from '@/lib/avatarShape';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { NoteContent } from '@/components/NoteContent';
import { ReactionButton } from '@/components/ReactionButton';
import { RepostMenu } from '@/components/RepostMenu';
import { ProfileHoverCard } from '@/components/ProfileHoverCard';
import { EmojifiedText } from '@/components/CustomEmoji';
import { NoteMoreMenu } from '@/components/NoteMoreMenu';
import { ReplyComposeModal } from '@/components/ReplyComposeModal';
import { ZapDialog } from '@/components/ZapDialog';
import { useAuthor } from '@/hooks/useAuthor';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useEventStats } from '@/hooks/useTrending';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { useOpenPost } from '@/hooks/useOpenPost';
import { useBookSummary } from '@/hooks/useBookSummary';
import { getDisplayName } from '@/lib/getDisplayName';
import { timeAgo } from '@/lib/timeAgo';
import { canZap } from '@/lib/canZap';
import { cn } from '@/lib/utils';
import { BOOKSTR_KINDS, extractISBNFromEvent, parseBookReview, ratingToStars } from '@/lib/bookstr';
import type { NostrEvent } from '@nostrify/nostrify';

interface BookFeedItemProps {
  event: NostrEvent;
  className?: string;
}

/** Max height in px before truncation kicks in. */
const MAX_HEIGHT = 300;

/** Formats a sats amount into a compact human-readable string. */
function formatSats(sats: number): string {
  if (sats >= 1_000_000) return `${(sats / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (sats >= 1_000) return `${(sats / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return sats.toString();
}

/** Encodes the NIP-19 identifier for navigating to an event. */
function encodeEventId(event: NostrEvent): string {
  if (event.kind >= 30000 && event.kind < 40000) {
    const dTag = event.tags.find(([n]) => n === 'd')?.[1];
    if (dTag) {
      return nip19.naddrEncode({ kind: event.kind, pubkey: event.pubkey, identifier: dTag });
    }
  }
  return nip19.neventEncode({ id: event.id, author: event.pubkey });
}

export function BookFeedItem({ event, className }: BookFeedItemProps) {
  const { user } = useCurrentUser();
  const author = useAuthor(event.pubkey);
  const metadata = author.data?.metadata;
  const avatarShape = getAvatarShape(metadata as Record<string, unknown>);
  const displayName = getDisplayName(metadata, event.pubkey);
  const profileUrl = useProfileUrl(event.pubkey, metadata);
  const { data: stats } = useEventStats(event.id);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);

  const canZapAuthor = user && canZap(metadata);

  const isbn = useMemo(() => extractISBNFromEvent(event), [event]);
  const isReview = event.kind === BOOKSTR_KINDS.BOOK_REVIEW;
  const isComment = event.kind === 1111;
  const review = useMemo(() => isReview ? parseBookReview(event) : null, [event, isReview]);

  // For kind 1111 comments on books, navigate to the book page rather than the event detail.
  // For all other events, navigate to the event detail page.
  const postPath = useMemo(() => {
    if (isComment && isbn) {
      return `/i/isbn:${isbn}`;
    }
    return `/${encodeEventId(event)}`;
  }, [event, isComment, isbn]);

  const { onClick: openPost, onAuxClick: auxOpenPost } = useOpenPost(postPath);

  const handleCardClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (
      target.closest('a') ||
      target.closest('button') ||
      target.closest('[role="dialog"]') ||
      target.closest('[data-radix-dialog-overlay]') ||
      target.closest('[data-radix-dialog-content]') ||
      target.closest('[data-vaul-drawer]') ||
      target.closest('[data-vaul-drawer-overlay]') ||
      target.closest('[data-testid="zap-modal"]')
    ) {
      return;
    }
    openPost();
  };

  const handleAuxClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (
      target.closest('a') ||
      target.closest('button') ||
      target.closest('[role="dialog"]')
    ) {
      return;
    }
    auxOpenPost(e);
  };

  // Stars display for reviews
  const starCount = review?.rating !== undefined ? ratingToStars(review.rating) : 0;

  return (
    <article
      className={cn(
        'px-4 py-3 border-b border-border hover:bg-secondary/30 transition-colors cursor-pointer overflow-hidden',
        className,
      )}
      onClick={handleCardClick}
      onAuxClick={handleAuxClick}
    >
      <div className="flex gap-3">
        {/* Avatar */}
        {author.isLoading ? (
          <Skeleton className="size-11 rounded-full shrink-0" />
        ) : (
          <ProfileHoverCard pubkey={event.pubkey} asChild>
            <Link to={profileUrl} className="shrink-0" onClick={(e) => e.stopPropagation()}>
              <Avatar shape={avatarShape} className="size-11">
                <AvatarImage src={metadata?.picture} alt={displayName} />
                <AvatarFallback className="bg-primary/20 text-primary text-sm">
                  {displayName[0]?.toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </Link>
          </ProfileHoverCard>
        )}

        {/* Main content */}
        <div className="min-w-0 flex-1">
          {/* Author info */}
          {author.isLoading ? (
            <div className="min-w-0 space-y-1.5">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-36" />
            </div>
          ) : (
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <ProfileHoverCard pubkey={event.pubkey} asChild>
                  <Link
                    to={profileUrl}
                    className="font-bold text-[15px] hover:underline truncate"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {author.data?.event ? (
                      <EmojifiedText tags={author.data.event.tags}>{displayName}</EmojifiedText>
                    ) : displayName}
                  </Link>
                </ProfileHoverCard>

                {isReview && (
                  <Badge variant="secondary" className="gap-1 text-[10px] px-1.5 py-0 shrink-0 bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                    <Star className="size-3" />
                    reviewed
                  </Badge>
                )}
                {isComment && (
                  <Badge variant="secondary" className="gap-1 text-[10px] px-1.5 py-0 shrink-0 bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300">
                    <MessageSquare className="size-3" />
                    commented
                  </Badge>
                )}
                {!isReview && !isComment && isbn && (
                  <Badge variant="secondary" className="gap-1 text-[10px] px-1.5 py-0 shrink-0 bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
                    <BookOpen className="size-3" />
                    posted
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <span className="shrink-0 hover:underline whitespace-nowrap">
                  {timeAgo(event.created_at)}
                </span>
              </div>
            </div>
          )}

          {/* Star rating for reviews */}
          {isReview && review?.rating !== undefined && (
            <div className="flex items-center gap-1 mt-2">
              {[...Array(5)].map((_, i) => (
                <Star
                  key={i}
                  className={cn(
                    'size-4',
                    i < starCount
                      ? 'fill-amber-400 text-amber-400'
                      : 'text-muted-foreground/30',
                  )}
                />
              ))}
              <span className="text-sm text-muted-foreground ml-1">
                {(review.rating * 5).toFixed(1)}
              </span>
            </div>
          )}

          {/* Content with spoiler guard and truncation */}
          {isReview && review?.contentWarning ? (
            <SpoilerGuard warning={review.contentWarning}>
              <TruncatedContent event={event} content={review.content} isReview />
            </SpoilerGuard>
          ) : isReview && review ? (
            <TruncatedContent event={event} content={review.content} isReview />
          ) : (
            <TruncatedContent event={event} />
          )}

          {/* Book card */}
          {isbn && <InlineBookCard isbn={isbn} />}

          {/* Action buttons */}
          <div className="flex items-center gap-5 mt-3 -ml-2">
            <button
              className="flex items-center gap-1.5 p-2 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
              title="Reply"
              onClick={(e) => { e.stopPropagation(); setReplyOpen(true); }}
            >
              <MessageCircle className="size-5" />
              {stats?.replies ? <span className="text-sm tabular-nums">{stats.replies}</span> : null}
            </button>

            <RepostMenu event={event}>
              {(isReposted: boolean) => (
                <button
                  className={`flex items-center gap-1.5 p-2 rounded-full transition-colors ${isReposted ? 'text-accent hover:text-accent/80 hover:bg-accent/10' : 'text-muted-foreground hover:text-accent hover:bg-accent/10'}`}
                  title={isReposted ? 'Undo repost' : 'Repost'}
                >
                  <RepostIcon className="size-5" />
                  {(stats?.reposts || stats?.quotes) ? <span className="text-sm tabular-nums">{(stats?.reposts ?? 0) + (stats?.quotes ?? 0)}</span> : null}
                </button>
              )}
            </RepostMenu>

            <ReactionButton
              eventId={event.id}
              eventPubkey={event.pubkey}
              eventKind={event.kind}
              reactionCount={stats?.reactions}
            />

            {canZapAuthor && (
              <ZapDialog target={event}>
                <button
                  className="flex items-center gap-1.5 p-2 rounded-full text-muted-foreground hover:text-amber-500 hover:bg-amber-500/10 transition-colors"
                  title="Zap"
                >
                  <Zap className="size-5" />
                  {stats?.zapAmount ? <span className="text-sm tabular-nums">{formatSats(stats.zapAmount)}</span> : null}
                </button>
              </ZapDialog>
            )}

            <button
              className="p-2 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
              title="More"
              onClick={(e) => { e.stopPropagation(); setMoreMenuOpen(true); }}
            >
              <MoreHorizontal className="size-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Modals */}
      <ReplyComposeModal event={event} open={replyOpen} onOpenChange={setReplyOpen} />
      <NoteMoreMenu event={event} open={moreMenuOpen} onOpenChange={setMoreMenuOpen} />
    </article>
  );
}

/** Truncated content block with "Read more" fade and button. */
function TruncatedContent({ event, content, isReview }: { event: NostrEvent; content?: string; isReview?: boolean }) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const measure = useCallback(() => {
    const el = contentRef.current;
    if (el) setOverflows(el.scrollHeight > MAX_HEIGHT);
  }, []);

  useEffect(() => {
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);

  // Re-measure after images load
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const imgs = el.querySelectorAll('img');
    if (imgs.length === 0) return;
    imgs.forEach((img) => img.addEventListener('load', measure, { once: true }));
    return () => imgs.forEach((img) => img.removeEventListener('load', measure));
  }, [measure]);

  // For reviews with no written text, show a placeholder
  if (content !== undefined && !content) {
    return (
      <p className="mt-2 text-sm text-muted-foreground italic">Rating only, no written review</p>
    );
  }

  return (
    <div className={cn('mt-2 break-words overflow-hidden', isReview && 'pl-3 border-l-2 border-amber-300 dark:border-amber-700')}>
      <div
        ref={contentRef}
        style={!expanded && overflows ? { maxHeight: MAX_HEIGHT, overflow: 'hidden' } : undefined}
        className="relative"
      >
        <NoteContent event={event} className="text-[15px] leading-relaxed" />
        {!expanded && overflows && (
          <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-background to-transparent pointer-events-none" />
        )}
      </div>
      {overflows && (
        <button
          className="mt-1 text-sm text-primary hover:underline"
          onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
        >
          {expanded ? 'Show less' : 'Read more'}
        </button>
      )}
    </div>
  );
}

/** Renders a spoiler guard that hides content behind a warning. */
function SpoilerGuard({ warning, children }: { warning: string; children: React.ReactNode }) {
  const [revealed, setRevealed] = useState(false);

  if (revealed) {
    return (
      <div>
        <Badge variant="outline" className="text-orange-600 border-orange-200 dark:border-orange-800 mb-2 mt-2">
          <AlertTriangle className="size-3 mr-1" />
          Contains Spoilers
        </Badge>
        {children}
      </div>
    );
  }

  return (
    <div className="mt-2 py-4 text-center space-y-2" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-center gap-2 text-orange-600">
        <AlertTriangle className="size-4" />
        <span className="text-sm font-medium">Spoiler Warning</span>
      </div>
      <p className="text-xs text-muted-foreground">{warning}</p>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setRevealed(true)}
      >
        Show Review
      </Button>
    </div>
  );
}

/** Compact inline book card that shows cover, title, author, and year. */
function InlineBookCard({ isbn }: { isbn: string }) {
  const { data: book, isLoading } = useBookSummary(isbn);

  if (isLoading) {
    return (
      <div className="mt-3 flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border">
        <Skeleton className="w-10 h-14 rounded shrink-0" />
        <div className="flex-1 min-w-0 space-y-1.5">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
    );
  }

  if (!book) {
    return (
      <Link
        to={`/i/isbn:${isbn}`}
        className="mt-3 flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border hover:bg-muted/80 transition-colors"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-14 rounded bg-muted flex items-center justify-center shrink-0">
          <BookOpen className="size-5 text-muted-foreground/40" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-muted-foreground">ISBN {isbn}</p>
        </div>
      </Link>
    );
  }

  return (
    <Link
      to={`/i/isbn:${isbn}`}
      className="mt-3 flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border hover:bg-muted/80 transition-colors group/book"
      onClick={(e) => e.stopPropagation()}
    >
      {book.coverUrl ? (
        <img
          src={book.coverUrl}
          alt={`Cover of ${book.title}`}
          className="w-10 h-14 rounded object-cover shrink-0 shadow-sm group-hover/book:shadow-md transition-shadow"
          loading="lazy"
          onError={(e) => {
            (e.currentTarget as HTMLElement).style.display = 'none';
          }}
        />
      ) : (
        <div className="w-10 h-14 rounded bg-muted flex items-center justify-center shrink-0">
          <BookOpen className="size-5 text-muted-foreground/40" />
        </div>
      )}

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold line-clamp-1 group-hover/book:underline">{book.title}</p>
        <p className="text-xs text-muted-foreground line-clamp-1">{book.author}</p>
        {book.pubDate && (
          <p className="text-xs text-muted-foreground/70 mt-0.5">{book.pubDate}</p>
        )}
      </div>
    </Link>
  );
}

export function BookFeedItemSkeleton() {
  return (
    <div className="px-4 py-3 border-b border-border">
      <div className="flex gap-3">
        <Skeleton className="size-11 rounded-full shrink-0" />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-16" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
          </div>
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border">
            <Skeleton className="w-10 h-14 rounded shrink-0" />
            <div className="flex-1 min-w-0 space-y-1.5">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

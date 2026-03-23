import { useCallback, useMemo, useRef, useState } from 'react';
import { useSeoMeta } from '@unhead/react';
import { ArrowLeft, Globe, Heart, MessageSquare, MoreHorizontal, Repeat2, Star, AlertTriangle, PanelLeft, Trash2 } from 'lucide-react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { getAvatarShape } from '@/lib/avatarShape';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ThreadedReplyList } from '@/components/ThreadedReplyList';
import { ComposeBox } from '@/components/ComposeBox';
import { ReplyComposeModal } from '@/components/ReplyComposeModal';
import { QuickReactMenu } from '@/components/QuickReactMenu';
import { ReactionEmoji } from '@/components/CustomEmoji';
import { BookReviewFormDialog } from '@/components/BookReviewForm';
import { ProfileHoverCard } from '@/components/ProfileHoverCard';
import {
  UrlContentHeader,
  BookContentHeader,
  CountryContentHeader,
} from '@/components/ExternalContentHeader';
import { PrecipitationEffect } from '@/components/PrecipitationEffect';
import { parseExternalUri, headerLabel, seoTitle, type ExternalContent } from '@/lib/externalContent';
import { ratingToStars } from '@/lib/bookstr';
import { useAppContext } from '@/hooks/useAppContext';
import { useWeather, getPrecipitation } from '@/hooks/useWeather';
import { useComments } from '@/hooks/useComments';
import { useBookReviews } from '@/hooks/useBookReviews';
import { useAuthor } from '@/hooks/useAuthor';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { useMuteList } from '@/hooks/useMuteList';
import { isEventMuted } from '@/lib/muteHelpers';
import { useLinkPreview } from '@/hooks/useLinkPreview';
import { useLayoutOptions } from '@/contexts/LayoutContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useFeedSettings } from '@/hooks/useFeedSettings';
import { useWikipediaSummary } from '@/hooks/useWikipediaSummary';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/useToast';
import { getDisplayName } from '@/lib/getDisplayName';
import { timeAgo } from '@/lib/timeAgo';
import { formatNumber } from '@/lib/formatNumber';
import { extractWikipediaTitle } from '@/lib/linkEmbed';
import { cn } from '@/lib/utils';
import {
  useExternalUserReaction,
  useExternalReactionCount,
} from '@/hooks/useExternalReactions';
import type { NostrEvent } from '@nostrify/nostrify';
import type { BookReview } from '@/lib/bookstr';
import NotFound from './NotFound';

// ---------------------------------------------------------------------------
// Helper: NIP-73 k tag value
// ---------------------------------------------------------------------------

function getExternalKTag(content: ExternalContent): string {
  switch (content.type) {
    case 'url': return 'web';
    case 'isbn': return 'isbn';
    case 'iso3166': return 'iso3166';
    default: return 'web';
  }
}

// ---------------------------------------------------------------------------
// Action bar component for external content (react + share)
// ---------------------------------------------------------------------------

function ExternalActionBar({ content }: { content: ExternalContent }) {
  const { user } = useCurrentUser();
  const { mutate: publishEvent } = useNostrPublish();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const identifier = content.value;
  const { addToSidebar, removeFromSidebar, orderedItems } = useFeedSettings();

  const isInSidebar = orderedItems.includes(identifier);

  const handleAddToSidebar = useCallback(() => {
    addToSidebar(identifier);
    toast({ title: 'Added to sidebar' });
  }, [identifier, addToSidebar, toast]);

  const handleRemoveFromSidebar = useCallback(() => {
    removeFromSidebar(identifier);
    toast({ title: 'Removed from sidebar' });
  }, [identifier, removeFromSidebar, toast]);

  const userReactionData = useExternalUserReaction(content);
  const reactionCount = useExternalReactionCount(content);

  const hasReacted = !!userReactionData;
  const userEmoji = userReactionData?.emoji;
  const userReactionTags = userReactionData?.tags;

  // Reaction popover state
  const [reactOpen, setReactOpen] = useState(false);
  const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const justClosedRef = useRef(false);
  const pickerExpandedRef = useRef(false);

  // Share compose modal state
  const [shareOpen, setShareOpen] = useState(false);

  const handleMouseEnter = useCallback(() => {
    if (!user) return;
    if (justClosedRef.current) return;
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    setReactOpen(true);
  }, [user]);

  const handleMouseLeave = useCallback(() => {
    if (pickerExpandedRef.current) return;
    closeTimeoutRef.current = setTimeout(() => setReactOpen(false), 150);
  }, []);

  // Publish kind 17 reaction
  const handleReact = useCallback((emoji: string, emojiTag?: string[]) => {
    if (!user) return;

    const tags: string[][] = [
      ['k', getExternalKTag(content)],
      ['i', identifier],
    ];
    if (emojiTag) tags.push(emojiTag);

    queryClient.setQueryData(['external-user-reaction', identifier], { emoji: emoji || '+', tags });
    queryClient.setQueryData(['external-reaction-count', identifier], (prev: number | undefined) => (prev ?? 0) + 1);

    publishEvent(
      {
        kind: 17,
        content: emoji,
        created_at: Math.floor(Date.now() / 1000),
        tags,
      },
      {
        onSuccess: () => {
          setTimeout(() => {
            queryClient.invalidateQueries({ queryKey: ['external-user-reaction', identifier] });
            queryClient.invalidateQueries({ queryKey: ['external-reaction-count', identifier] });
          }, 3000);
        },
        onError: () => {
          toast({ title: 'Failed to react', variant: 'destructive' });
          queryClient.setQueryData(['external-user-reaction', identifier], null);
          queryClient.setQueryData(['external-reaction-count', identifier], (prev: number | undefined) => Math.max(0, (prev ?? 1) - 1));
        },
      },
    );
  }, [user, content, identifier, publishEvent, queryClient, toast]);

  return (
    <div className="flex items-center gap-1 px-4 py-2 border-b border-border">
      {/* Reaction button */}
      <Popover open={reactOpen} onOpenChange={(open) => {
        if (open && justClosedRef.current) return;
        if (!open) pickerExpandedRef.current = false;
        setReactOpen(open);
      }}>
        <PopoverTrigger asChild>
          <button
            className={`flex items-center gap-1.5 p-2 rounded-full transition-colors ${
              hasReacted
                ? 'text-pink-500'
                : 'text-muted-foreground hover:text-pink-500 hover:bg-pink-500/10'
            }`}
            title="React"
            onClick={(e) => {
              e.stopPropagation();
              if (!user) return;
              if (justClosedRef.current) return;
              setReactOpen((prev) => !prev);
            }}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            {hasReacted && userEmoji ? (
              <span className="size-5 flex items-center justify-center text-base leading-none">
                <ReactionEmoji content={userEmoji} tags={userReactionTags} className="size-5" />
              </span>
            ) : (
              <Heart className="size-5" />
            )}
            {reactionCount > 0 && (
              <span className="text-sm tabular-nums">{formatNumber(reactionCount)}</span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="w-auto p-0 border-0 bg-transparent shadow-none"
          side="top"
          align="start"
          onClick={(e) => e.stopPropagation()}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <QuickReactMenu
            eventId={identifier}
            eventPubkey=""
            eventKind={17}
            onExpandChange={(expanded) => { pickerExpandedRef.current = expanded; }}
            onClose={() => {
              pickerExpandedRef.current = false;
              justClosedRef.current = true;
              setReactOpen(false);
              setTimeout(() => { justClosedRef.current = false; }, 300);
            }}
            onReact={handleReact}
          />
        </PopoverContent>
      </Popover>

      {/* Share button — opens compose modal pre-filled with the URL */}
      <button
        className="flex items-center gap-1.5 p-2 rounded-full transition-colors text-muted-foreground hover:text-accent hover:bg-accent/10"
        title="Share to feed"
        onClick={() => setShareOpen(true)}
      >
        <Repeat2 className="size-5" />
      </button>

      {/* Write Review button — only for ISBN content */}
      {content.type === 'isbn' && user && (
        <BookReviewFormDialog isbn={content.value.replace('isbn:', '')}>
          <button
            className="flex items-center gap-1.5 p-2 rounded-full transition-colors text-muted-foreground hover:text-amber-500 hover:bg-amber-500/10"
            title="Write a review"
          >
            <Star className="size-5" />
          </button>
        </BookReviewFormDialog>
      )}

      {/* Spacer pushes the 3-dots menu to the right */}
      <div className="flex-1" />

      {/* 3-dots menu with sidebar action */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="p-2 rounded-full transition-colors text-muted-foreground hover:text-primary hover:bg-primary/10"
            title="More"
          >
            <MoreHorizontal className="size-5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {isInSidebar ? (
            <DropdownMenuItem onClick={handleRemoveFromSidebar} className="gap-3">
              <Trash2 className="size-4" />
              Remove from sidebar
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={handleAddToSidebar} className="gap-3">
              <PanelLeft className="size-4" />
              Add to sidebar
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {shareOpen && (
        <ReplyComposeModal
          open={shareOpen}
          onOpenChange={setShareOpen}
          initialContent={identifier}
          title="Share to feed"
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export function ExternalContentPage() {
  const { config } = useAppContext();
  const { '*': rawUri } = useParams();
  const location = useLocation();

  // Support both encoded URLs (/i/https%3A%2F%2F...) and bare URLs (/i/https://...?q=x).
  // For bare URLs the browser splits the target's query string into location.search,
  // so we reattach it. For encoded URLs we decode the whole thing.
  const uri = useMemo(() => {
    if (!rawUri) return '';
    // If the wildcard param looks already encoded (no "://" present), decode it.
    if (!rawUri.includes('://')) {
      return decodeURIComponent(rawUri);
    }
    // Otherwise it's a bare URL — reattach any query string the browser separated out.
    return rawUri + location.search;
  }, [rawUri, location.search]);

  const content = useMemo(() => {
    if (!uri) return null;
    return parseExternalUri(uri);
  }, [uri]);

  // Fetch link preview for URL content to get the actual page title.
  const linkPreviewUrl = content?.type === 'url' ? content.value : null;
  const { data: linkPreview } = useLinkPreview(linkPreviewUrl);

  // For Wikipedia URLs, use the Wikipedia API for accurate titles.
  const wikiTitle = useMemo(() => linkPreviewUrl ? extractWikipediaTitle(linkPreviewUrl) : null, [linkPreviewUrl]);
  const { data: wikiSummary } = useWikipediaSummary(wikiTitle);
  const resolvedTitle = wikiSummary?.title ?? linkPreview?.title;

  const pageTitle = resolvedTitle ?? (content ? headerLabel(content) : 'External Content');

  useSeoMeta({ title: content ? (resolvedTitle ? `${resolvedTitle} | ${config.appName}` : seoTitle(content, config.appName)) : `External Content | ${config.appName}` });

  // Build the NIP-73 identifier for comments.
  // For URLs, the raw URL is used. For others, the full prefixed identifier.
  const commentRoot = useMemo(() => {
    if (!content) return undefined;
    return new URL(content.value);
  }, [content]);

  const { muteItems } = useMuteList();
  const { data: commentsData, isLoading: commentsLoading } = useComments(commentRoot, 500);

  // Build a reply tree: direct replies each paired with their first sub-reply.
  const orderedReplies = useMemo(() => {
    const topLevel = commentsData?.topLevelComments ?? [];
    const filteredTopLevel = muteItems.length > 0
      ? topLevel.filter((r) => !isEventMuted(r, muteItems))
      : topLevel;

    // Country feeds are social feeds (newest-first); other types are threaded conversations (oldest-first)
    const sorted = [...filteredTopLevel].sort((a, b) =>
      content?.type === 'iso3166'
        ? b.created_at - a.created_at
        : a.created_at - b.created_at
    );

    return sorted.map((reply) => {
      const directReplies = commentsData?.getDirectReplies(reply.id) ?? [];
      return {
        reply,
        firstSubReply: directReplies[0] as import('@nostrify/nostrify').NostrEvent | undefined,
      };
    });
  }, [commentsData, muteItems]);

  // FAB opens the comment compose dialog
  const [composeOpen, setComposeOpen] = useState(false);
  const openCompose = useCallback(() => setComposeOpen(true), []);

  // Weather-based precipitation effect for country pages
  const isCountry = content?.type === 'iso3166';
  const countryCode = isCountry ? content.code : null;
  const { data: weather } = useWeather(countryCode);
  const precipitation = useMemo(() => {
    if (!weather) return null;
    return getPrecipitation(weather.weatherCode);
  }, [weather]);

  useLayoutOptions({
    showFAB: true,
    onFabClick: openCompose,
  });

  if (!content || !uri || !commentRoot) {
    return <NotFound />;
  }

  return (
    <main className="">
      {/* Precipitation overlay for country pages */}
      {precipitation?.type && (
        <PrecipitationEffect type={precipitation.type} intensity={precipitation.intensity} />
      )}

      {/* Non-sticky transparent header */}
      <div className="flex items-center gap-4 px-4 pt-4 pb-5">
        <Link
          to={content.type === 'isbn' ? '/books' : wikiTitle ? '/wikipedia' : '/'}
          className={cn(
            'p-2 rounded-full hover:bg-secondary transition-colors',
            content.type !== 'isbn' && !wikiTitle && 'sidebar:hidden',
          )}
        >
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="text-xl font-bold truncate">{pageTitle}</h1>
      </div>

      <div className="px-4 space-y-6 pb-4">
        {/* Content-specific header */}
        {content.type === 'url' && <UrlContentHeader url={content.value} />}
        {content.type === 'isbn' && <BookContentHeader isbn={content.value} />}
        {content.type === 'iso3166' && <CountryContentHeader code={content.code} />}
        {content.type === 'unknown' && (
          <div className="rounded-2xl border border-border p-5 text-center">
            <Globe className="size-8 mx-auto mb-2 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground break-all">{content.value}</p>
          </div>
        )}
      </div>

      {/* React / share action bar */}
      <ExternalActionBar content={content} />

      {/* Comment compose dialog (opened via FAB) */}
      <ReplyComposeModal event={commentRoot} open={composeOpen} onOpenChange={setComposeOpen} />

      {/* ISBN pages get a tabbed interface with Comments + Reviews */}
      {content.type === 'isbn' ? (
        <BookContentTabs
          isbn={content.value.replace('isbn:', '')}
          commentRoot={commentRoot}
          orderedReplies={orderedReplies}
          commentsLoading={commentsLoading}
        />
      ) : (
        <>
          {/* Inline compose box */}
          <ComposeBox compact replyTo={commentRoot} />

          {/* Threaded comments list */}
          <div>
            {commentsLoading ? (
              <CommentsSkeleton />
            ) : orderedReplies.length > 0 ? (
              <ThreadedReplyList replies={orderedReplies} />
            ) : (
              <CommentsEmptyState />
            )}
          </div>
         </>
      )}
    </main>
  );
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function CommentsSkeleton() {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="px-4 py-3">
          <div className="flex gap-3">
            <Skeleton className="size-10 rounded-full shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-3 w-28" />
              </div>
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function CommentsEmptyState() {
  return (
    <div className="py-12 text-center text-muted-foreground text-sm">
      <MessageSquare className="size-12 mx-auto mb-4 opacity-30" />
      <p className="text-lg font-medium mb-2">No comments yet</p>
      <p>Be the first to share your thoughts about this!</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Book Content Tabs (Comments + Reviews)
// ---------------------------------------------------------------------------

interface BookContentTabsProps {
  isbn: string;
  commentRoot: URL;
  orderedReplies: Array<{ reply: NostrEvent; firstSubReply?: NostrEvent }>;
  commentsLoading: boolean;
}

function BookContentTabs({ isbn, commentRoot, orderedReplies, commentsLoading }: BookContentTabsProps) {
  const { user } = useCurrentUser();
  const { data: reviews = [], isLoading: reviewsLoading } = useBookReviews(isbn);

  return (
    <Tabs defaultValue="comments" className="w-full">
      <TabsList className="w-full rounded-none border-b border-border bg-transparent h-auto p-0">
        <TabsTrigger
          value="comments"
          className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none py-3 text-sm font-medium"
        >
          <MessageSquare className="size-4 mr-2" />
          Comments{orderedReplies.length > 0 ? ` (${orderedReplies.length})` : ''}
        </TabsTrigger>
        <TabsTrigger
          value="reviews"
          className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none py-3 text-sm font-medium"
        >
          <Star className="size-4 mr-2" />
          Reviews{reviews.length > 0 ? ` (${reviews.length})` : ''}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="comments" className="mt-0">
        {/* Inline compose box */}
        <ComposeBox compact replyTo={commentRoot} />

        {/* Threaded comments list */}
        <div>
          {commentsLoading ? (
            <CommentsSkeleton />
          ) : orderedReplies.length > 0 ? (
            <ThreadedReplyList replies={orderedReplies} />
          ) : (
            <CommentsEmptyState />
          )}
        </div>
      </TabsContent>

      <TabsContent value="reviews" className="mt-0">
        {/* Write review CTA */}
        {user && (
          <div className="px-4 py-3 border-b border-border">
            <BookReviewFormDialog isbn={isbn}>
              <Button variant="outline" className="w-full">
                <Star className="size-4 mr-2" />
                Write a Review
              </Button>
            </BookReviewFormDialog>
          </div>
        )}

        {/* Reviews list */}
        {reviewsLoading ? (
          <CommentsSkeleton />
        ) : reviews.length > 0 ? (
          <div className="divide-y divide-border">
            {reviews.map(({ event, review }) => (
              <BookReviewCard key={event.id} event={event} review={review} />
            ))}
          </div>
        ) : (
          <div className="py-12 text-center text-muted-foreground text-sm">
            <Star className="size-12 mx-auto mb-4 opacity-30" />
            <p className="text-lg font-medium mb-2">No reviews yet</p>
            <p>Be the first to review this book!</p>
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}

// ---------------------------------------------------------------------------
// Book Review Card (shown in Reviews tab)
// ---------------------------------------------------------------------------

function BookReviewCard({ event, review }: { event: NostrEvent; review: BookReview }) {
  const author = useAuthor(event.pubkey);
  const metadata = author.data?.metadata;
  const avatarShape = getAvatarShape(metadata);
  const displayName = getDisplayName(metadata, event.pubkey);
  const profileUrl = useProfileUrl(event.pubkey, metadata);
  const [showSpoiler, setShowSpoiler] = useState(false);

  const starCount = review.rating !== undefined ? ratingToStars(review.rating) : 0;
  const hasSpoiler = !!review.contentWarning;

  return (
    <div className="px-4 py-3">
      <div className="flex gap-3">
        {/* Avatar */}
        {author.isLoading ? (
          <Skeleton className="size-10 rounded-full shrink-0" />
        ) : (
          <ProfileHoverCard pubkey={event.pubkey} asChild>
            <Link to={profileUrl} className="shrink-0">
              <Avatar shape={avatarShape} className="size-10">
                <AvatarImage src={metadata?.picture} alt={displayName} />
                <AvatarFallback className="bg-primary/20 text-primary text-sm">
                  {displayName[0]?.toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </Link>
          </ProfileHoverCard>
        )}

        <div className="min-w-0 flex-1">
          {/* Author and time */}
          <div className="flex items-start justify-between">
            <div>
              <ProfileHoverCard pubkey={event.pubkey} asChild>
                <Link to={profileUrl} className="font-semibold text-sm hover:underline">
                  {displayName}
                </Link>
              </ProfileHoverCard>
              <p className="text-xs text-muted-foreground">{timeAgo(event.created_at)}</p>
            </div>

            {/* Star rating */}
            {review.rating !== undefined && (
              <div className="flex items-center gap-1 shrink-0">
                {[...Array(5)].map((_, i) => (
                  <Star
                    key={i}
                    className={cn(
                      'size-3.5',
                      i < starCount
                        ? 'fill-amber-400 text-amber-400'
                        : 'text-muted-foreground/30',
                    )}
                  />
                ))}
                <span className="text-xs text-muted-foreground ml-1">
                  {(review.rating * 5).toFixed(1)}
                </span>
              </div>
            )}
          </div>

          {/* Content with spoiler guard */}
          {hasSpoiler && !showSpoiler ? (
            <div className="mt-2 py-3 text-center space-y-2">
              <div className="flex items-center justify-center gap-2 text-orange-600">
                <AlertTriangle className="size-4" />
                <span className="text-sm font-medium">Spoiler Warning</span>
              </div>
              <p className="text-xs text-muted-foreground">{review.contentWarning}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowSpoiler(true)}
              >
                Show Review
              </Button>
            </div>
          ) : (
            <div className="mt-2">
              {hasSpoiler && (
                <Badge variant="outline" className="text-orange-600 border-orange-200 dark:border-orange-800 mb-2">
                  <AlertTriangle className="size-3 mr-1" />
                  Contains Spoilers
                </Badge>
              )}
              {review.content ? (
                <p className="text-sm whitespace-pre-wrap break-words">{review.content}</p>
              ) : (
                <p className="text-sm text-muted-foreground italic">Rating only, no written review</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

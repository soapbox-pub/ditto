import { useCallback, useMemo, useRef, useState } from 'react';
import { useSeoMeta } from '@unhead/react';
import { ArrowLeft, Globe, Heart, MessageSquare, Repeat2 } from 'lucide-react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ThreadedReplyList } from '@/components/ThreadedReplyList';
import { ComposeBox } from '@/components/ComposeBox';
import { ReplyComposeModal } from '@/components/ReplyComposeModal';
import { QuickReactMenu } from '@/components/QuickReactMenu';
import {
  UrlContentHeader,
  BookContentHeader,
  CountryContentHeader,
} from '@/components/ExternalContentHeader';
import { parseExternalUri, headerLabel, seoTitle, type ExternalContent } from '@/lib/externalContent';
import { useAppContext } from '@/hooks/useAppContext';
import { useComments } from '@/hooks/useComments';
import { useMuteList } from '@/hooks/useMuteList';
import { isEventMuted } from '@/lib/muteHelpers';
import { useLayoutOptions } from '@/contexts/LayoutContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/useToast';
import {
  useExternalUserReaction,
  useExternalReactionCount,
} from '@/hooks/useExternalReactions';
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

  const userReaction = useExternalUserReaction(content);
  const reactionCount = useExternalReactionCount(content);

  const hasReacted = !!userReaction;

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
  const handleReact = useCallback((emoji: string) => {
    if (!user) return;
    queryClient.setQueryData(['external-user-reaction', identifier], emoji || '+');
    queryClient.setQueryData(['external-reaction-count', identifier], (prev: number | undefined) => (prev ?? 0) + 1);

    publishEvent(
      {
        kind: 17,
        content: emoji,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ['k', getExternalKTag(content)],
          ['i', identifier],
        ],
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
            {hasReacted ? (
              <span className="size-5 flex items-center justify-center text-base leading-none">
                {userReaction === '+' ? '👍' : userReaction}
              </span>
            ) : (
              <Heart className="size-5" />
            )}
            {reactionCount > 0 && (
              <span className="text-sm tabular-nums">{reactionCount}</span>
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

  useSeoMeta({ title: content ? seoTitle(content, config.appName) : `External Content | ${config.appName}` });

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

    // Sort oldest-first for threaded conversation view (useComments returns newest-first)
    const sorted = [...filteredTopLevel].sort((a, b) => a.created_at - b.created_at);

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

  useLayoutOptions({
    showFAB: true,
    onFabClick: openCompose,
  });

  if (!content || !uri || !commentRoot) {
    return <NotFound />;
  }

  return (
    <main className="">
      {/* Non-sticky transparent header */}
      <div className="flex items-center gap-4 px-4 pt-4 pb-5">
        <Link to="/" className="p-2 rounded-full hover:bg-secondary transition-colors sidebar:hidden">
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="text-xl font-bold truncate">{headerLabel(content)}</h1>
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

      {/* Inline compose box */}
      <ComposeBox compact replyTo={commentRoot} />

      {/* Comment compose dialog (opened via FAB) */}
      <ReplyComposeModal event={commentRoot} open={composeOpen} onOpenChange={setComposeOpen} />

      {/* Threaded comments list */}
      <div>
        {commentsLoading ? (
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
        ) : orderedReplies.length > 0 ? (
          <ThreadedReplyList replies={orderedReplies} />
        ) : (
          <div className="py-12 text-center text-muted-foreground text-sm">
            <MessageSquare className="size-12 mx-auto mb-4 opacity-30" />
            <p className="text-lg font-medium mb-2">No comments yet</p>
            <p>Be the first to share your thoughts about this!</p>
          </div>
        )}
      </div>
    </main>
  );
}

import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';
import { Loader2, MessageCircle, Package } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useInView } from 'react-intersection-observer';

import { AppHandlerContent } from '@/components/AppHandlerContent';
import { ComposeBox } from '@/components/ComposeBox';
import { EventActionHeader } from '@/components/NoteCard';
import { NoteCard } from '@/components/NoteCard';
import { SubHeaderBar } from '@/components/SubHeaderBar';
import { TabButton } from '@/components/TabButton';
import { FlatThreadedReplyList } from '@/components/ThreadedReplyList';
import { Skeleton } from '@/components/ui/skeleton';
import { useComments } from '@/hooks/useComments';
import { useMuteList } from '@/hooks/useMuteList';
import { useTabFeed } from '@/hooks/useProfileFeed';
import { PostDetailShell } from '@/pages/PostDetailPage';
import { feedItemKey, shouldHideFeedEvent } from '@/lib/feedUtils';
import { isEventMuted } from '@/lib/muteHelpers';
import { isReplyEvent } from '@/lib/nostrEvents';
import { publishedAtAction } from '@/lib/publishedAtAction';

type Tab = 'feed' | 'comments';

/**
 * True if `event` carries a NIP-89 `client` tag whose handler-event-identifier
 * (the tag's 3rd value, format `"31990:<pubkey>:<d>"`) matches `addr`.
 */
function hasMatchingClientTag(event: NostrEvent, addr: string): boolean {
  return event.tags.some(([name, , identifier]) => name === 'client' && identifier === addr);
}

/**
 * Detail page for a kind 31990 NIP-89 application handler (naddr).
 *
 * Shows the app showcase card on top, then a tabbed UI:
 * - **Feed** — every event published *through* this client, found via the
 *   Ditto relay's NIP-50 `search` extension `client:<addr>` where `<addr>` is
 *   the handler's `"31990:<pubkey>:<d>"` coordinate.
 * - **Comments** — NIP-22 (kind 1111) comments addressed to the handler event.
 */
export function AppHandlerDetailPage({ event }: { event: NostrEvent }) {
  const [activeTab, setActiveTab] = useState<Tab>('feed');

  // The addressable coordinate for this handler: "31990:<pubkey>:<d>".
  const addr = useMemo(() => {
    const d = event.tags.find(([n]) => n === 'd')?.[1] ?? '';
    return `${event.kind}:${event.pubkey}:${d}`;
  }, [event]);

  return (
    <PostDetailShell title="App">
      <div className="px-4">
        <EventActionHeader
          pubkey={event.pubkey}
          icon={Package}
          action={publishedAtAction(event, {
            created: 'published an app',
            updated: 'updated an app',
            fallback: 'published an app',
          })}
        />
        <AppHandlerContent event={event} />
      </div>

      {/* Tab bar */}
      <SubHeaderBar className="mt-4">
        <TabButton label="Feed" active={activeTab === 'feed'} onClick={() => setActiveTab('feed')} />
        <TabButton label="Comments" active={activeTab === 'comments'} onClick={() => setActiveTab('comments')} />
      </SubHeaderBar>

      <div className="pb-16 sidebar:pb-0">
        {activeTab === 'feed' ? (
          <AppHandlerFeedTab addr={addr} />
        ) : (
          <AppHandlerCommentsTab event={event} />
        )}
      </div>
    </PostDetailShell>
  );
}

// ─── Feed Tab ─────────────────────────────────────────────────────────────────

/**
 * Infinite-scroll feed of every event posted through this client, queried via
 * the Ditto relay's NIP-50 `client:<addr>` search extension.
 */
function AppHandlerFeedTab({ addr }: { addr: string }) {
  const { muteItems } = useMuteList();
  const { ref: sentinelRef, inView } = useInView({ threshold: 0, rootMargin: '400px' });

  const filter = useMemo<NostrFilter>(
    () => ({ kinds: [1], search: `client:${addr}` }),
    [addr],
  );

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useTabFeed(filter, `app-handler-${addr}`);

  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const feedItems = useMemo(() => {
    if (!data?.pages) return [];
    const seen = new Set<string>();
    return data.pages
      .flatMap((page) => page.items)
      .filter((item) => {
        const key = item.repostedBy ? `repost-${item.repostedBy}-${item.event.id}` : item.event.id;
        if (seen.has(key)) return false;
        seen.add(key);
        // The relay `search` is best-effort, so confirm client-side that the
        // event actually carries a NIP-89 `client` tag pointing at this handler
        // (the handler-event-identifier sits in the tag's 3rd position).
        if (!hasMatchingClientTag(item.event, addr)) return false;
        if (shouldHideFeedEvent(item.event)) return false;
        if (muteItems.length > 0 && isEventMuted(item.event, muteItems)) return false;
        // Hide replies — show top-level posts only.
        if (item.event.kind === 1 && !item.repostedBy && isReplyEvent(item.event)) {
          return false;
        }
        return true;
      });
  }, [data?.pages, muteItems, addr]);

  if (isLoading && feedItems.length === 0) {
    return <FeedSkeleton />;
  }

  if (feedItems.length === 0) {
    return (
      <div className="py-16 flex flex-col items-center gap-3 text-center px-8">
        <Package className="size-8 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground max-w-sm">
          No posts from this app yet. Content published through it will appear here.
        </p>
      </div>
    );
  }

  return (
    <div>
      {feedItems.map((item) => (
        <NoteCard
          key={feedItemKey(item)}
          event={item.event}
          repostedBy={item.repostedBy}
          repostEvent={item.repostEvent}
          reactedBy={item.reactedBy}
          zappedBy={item.zappedBy}
          profileZapRecipient={item.profileZapRecipient}
        />
      ))}
      {hasNextPage && (
        <div ref={sentinelRef} className="flex justify-center py-6">
          {isFetchingNextPage && <Loader2 className="size-5 animate-spin text-muted-foreground" />}
        </div>
      )}
    </div>
  );
}

function FeedSkeleton() {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="px-4 py-3">
          <div className="flex gap-3">
            <Skeleton className="size-11 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Comments Tab ─────────────────────────────────────────────────────────────

/** NIP-22 comments addressed to the handler event (indexed by #A). */
function AppHandlerCommentsTab({ event }: { event: NostrEvent }) {
  const { muteItems } = useMuteList();
  const { data: commentsData, isLoading } = useComments(event, 500);

  const orderedReplies = useMemo(() => {
    const topLevel = commentsData?.topLevelComments ?? [];
    const filtered = muteItems.length > 0
      ? topLevel.filter((r) => !isEventMuted(r, muteItems))
      : topLevel;
    return [...filtered]
      .sort((a, b) => b.created_at - a.created_at)
      .map((reply) => {
        const directReplies = commentsData?.getDirectReplies(reply.id) ?? [];
        return {
          reply,
          firstSubReply: directReplies[0] as NostrEvent | undefined,
        };
      });
  }, [commentsData, muteItems]);

  return (
    <div>
      <ComposeBox compact replyTo={event} />
      {isLoading ? (
        <CommentsSkeleton />
      ) : orderedReplies.length > 0 ? (
        <FlatThreadedReplyList replies={orderedReplies} />
      ) : (
        <div className="py-16 flex flex-col items-center gap-3 text-center px-8">
          <MessageCircle className="size-8 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">
            No comments yet. Be the first to comment.
          </p>
        </div>
      )}
    </div>
  );
}

function CommentsSkeleton() {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="px-4 py-3">
          <div className="flex gap-3">
            <Skeleton className="size-10 rounded-full shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-3/4" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

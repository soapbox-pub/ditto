import { useMemo, type ReactNode } from 'react';
import { Plus, Check, Loader2 } from 'lucide-react';
import { useNostr } from '@nostrify/react';
import { useInfiniteQuery, type InfiniteData, type QueryKey } from '@tanstack/react-query';
import { NoteCard } from '@/components/NoteCard';
import { PullToRefresh } from '@/components/PullToRefresh';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { DITTO_RELAYS } from '@/lib/appRelays';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useFeedSettings } from '@/hooks/useFeedSettings';
import { useInterests } from '@/hooks/useInterests';
import { useMuteFilter } from '@/hooks/useMuteFilter';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { usePageRefresh } from '@/hooks/usePageRefresh';
import { getEnabledFeedKinds } from '@/lib/extraKinds';
import { getPaginationCursor, isRepostKind } from '@/lib/feedUtils';
import { buildTagFilterValues } from '@/lib/tagFilterValues';
import { PageHeader } from '@/components/PageHeader';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';
import { containsBlockedTerm } from '@/lib/blockedTerms';
import { isHiddenFromPublicFeeds } from '@/lib/nsfw';

const PAGE_SIZE = 20;

interface TagFeedPageProps {
  /** The tag value to filter by. */
  tag: string;
  /** The Nostr filter key, e.g. '#t' or '#g'. */
  filterKey: '#t' | '#g';
  /** Icon shown before the title in the header. */
  icon?: ReactNode;
  /** Title text displayed in the header. */
  title: string;
  /** Whether to show a follow/unfollow button (hashtags only). */
  followable?: boolean;
  /** Extra relay search param (e.g. 'sort:hot'). */
  search?: string;
  /** Empty state message. */
  emptyMessage: string;
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

export function TagFeedPage({
  tag,
  filterKey,
  icon,
  title,
  followable = false,
  search,
  emptyMessage,
}: TagFeedPageProps) {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { feedSettings } = useFeedSettings();
  const { isMuted } = useMuteFilter();
  const interestTagName = filterKey === '#g' ? 'g' : 't';
  const { hasInterest, addInterest, removeInterest } = useInterests(interestTagName);

  const isFollowing = followable ? hasInterest(tag) : false;
  const interestPending = addInterest.isPending || removeInterest.isPending;

  const kinds = getEnabledFeedKinds(feedSettings).filter((k) => !isRepostKind(k));
  const kindsKey = [...kinds].sort().join(',');
  const tagFilterValues = useMemo(() => buildTagFilterValues(tag, filterKey), [tag, filterKey]);
  const tagFilterValuesKey = tagFilterValues.join('|');

  const queryKey = useMemo(
    () => ['tag-feed', filterKey, tagFilterValuesKey, kindsKey],
    [filterKey, tagFilterValuesKey, kindsKey],
  );
  const handleRefresh = usePageRefresh(queryKey);

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery<NostrEvent[], Error, InfiniteData<NostrEvent[]>, QueryKey, number | undefined>({
    queryKey,
    queryFn: async ({ pageParam, signal }) => {
      const ditto = nostr.group(DITTO_RELAYS);
      const tagFilter: NostrFilter = { kinds, limit: PAGE_SIZE, ...(search ? { search } : {}) };
      // NostrFilter uses `#${letter}` index signature — assign after construction to satisfy TS
      (tagFilter as Record<string, unknown>)[filterKey] = tagFilterValues;
      if (pageParam !== undefined) tagFilter.until = pageParam;
      return ditto.query([tagFilter], {
        signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]),
      });
    },
    // Cursor from the unfiltered relay page, so muted or hidden events still
    // advance it. Gap detection keeps a single old outlier in a hot-sorted
    // page from skipping everything newer than it.
    getNextPageParam: (lastPage) => lastPage.length ? getPaginationCursor(lastPage) - 1 : undefined,
    initialPageParam: undefined,
    // Never query a blocked term (see blockedTerms.ts).
    enabled: tagFilterValues.length > 0 && !containsBlockedTerm(tag),
  });

  const { scrollRef } = useInfiniteScroll({
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    pageCount: data?.pages.length,
  });

  const filteredEvents = useMemo(() => {
    if (!data) return undefined;
    const seen = new Set<string>();
    return data.pages.flat().filter((e) => {
      if (seen.has(e.id)) return false;
      seen.add(e.id);
      return !isMuted(e) && !isHiddenFromPublicFeeds(e);
    });
  }, [data, isMuted]);

  return (
    <main className="">
      <PageHeader
        title={title}
        icon={icon ? <span className="text-muted-foreground shrink-0">{icon}</span> : undefined}
      >
        {followable && user && tag && (
          <Button
            size="sm"
            variant={isFollowing ? 'outline' : 'default'}
            className="rounded-full gap-1.5 shrink-0"
            disabled={interestPending}
            onClick={() => isFollowing ? removeInterest.mutate(tag) : addInterest.mutate(tag)}
          >
            {interestPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : isFollowing ? (
              <><Check className="size-3.5" /> Following</>
            ) : (
              <><Plus className="size-3.5" /> Follow</>
            )}
          </Button>
        )}
      </PageHeader>

      <PullToRefresh onRefresh={handleRefresh}>
        {isLoading ? (
          <FeedSkeleton />
        ) : filteredEvents && filteredEvents.length > 0 ? (
          <div>
            {filteredEvents.map((event) => <NoteCard key={event.id} event={event} />)}
            {hasNextPage && (
              <div ref={scrollRef} className="py-4">
                {isFetchingNextPage && (
                  <div className="flex justify-center">
                    <Loader2 className="size-5 animate-spin text-muted-foreground" />
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="py-16 text-center text-muted-foreground px-4">
            <span className="break-all">{emptyMessage}</span>
          </div>
        )}
      </PullToRefresh>
    </main>
  );
}

import { useMemo, useEffect } from 'react';
import { useInView } from 'react-intersection-observer';
import { NoteCard } from '@/components/NoteCard';
import { Skeleton } from '@/components/ui/skeleton';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useProfileFeed, filterByTab } from '@/hooks/useProfileFeed';
import type { FeedItem } from '@/lib/feedUtils';

/** Current user's profile feed for a deck column. */
export function DeckProfile() {
  const { user } = useCurrentUser();
  const { data, isLoading, hasNextPage, isFetchingNextPage, fetchNextPage } = useProfileFeed(user?.pubkey);

  const items: FeedItem[] = useMemo(() => {
    if (!data) return [];
    const all = data.pages.flatMap((p) => p.items);
    return filterByTab(all, 'posts');
  }, [data]);

  const { ref: scrollRef, inView } = useInView({ threshold: 0, rootMargin: '400px' });

  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (!user) {
    return <div className="py-12 text-center text-muted-foreground text-sm">Log in to see your profile.</div>;
  }

  if (isLoading) {
    return (
      <div className="divide-y divide-border">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="px-4 py-3">
            <div className="flex items-center gap-3">
              <Skeleton className="size-11 rounded-full shrink-0" />
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-36" />
              </div>
            </div>
            <Skeleton className="h-4 w-full mt-2" />
            <Skeleton className="h-4 w-4/5 mt-1" />
          </div>
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return <div className="py-12 text-center text-muted-foreground text-sm">No posts yet.</div>;
  }

  return (
    <div>
      {items.map((item) => (
        <NoteCard key={item.event.id} event={item.event} repostedBy={item.repostedBy} />
      ))}
      {hasNextPage && <div ref={scrollRef} className="py-4" />}
    </div>
  );
}

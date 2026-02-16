---
name: nostr-infinite-scroll
description: Build feed interfaces, implement pagination for Nostr events, or create social media-style infinite scroll experiences.
---

# Infinite Scroll for Nostr Feeds

For feed-like interfaces, implement infinite scroll using TanStack Query's `useInfiniteQuery` with Nostr's timestamp-based pagination:

```typescript
import { useNostr } from '@nostrify/react';
import { useInfiniteQuery } from '@tanstack/react-query';

export function useGlobalFeed() {
  const { nostr } = useNostr();

  return useInfiniteQuery({
    queryKey: ['global-feed'],
    queryFn: async ({ pageParam, signal }) => {
      const filter = { kinds: [1], limit: 20 };
      if (pageParam) filter.until = pageParam;

      const events = await nostr.query([filter], {
        signal: AbortSignal.any([signal, AbortSignal.timeout(1500)])
      });

      return events;
    },
    getNextPageParam: (lastPage) => {
      if (lastPage.length === 0) return undefined;
      return lastPage[lastPage.length - 1].created_at - 1; // Subtract 1 since 'until' is inclusive
    },
    initialPageParam: undefined,
  });
}
```

Example usage with intersection observer for automatic loading:

```tsx
import { useInView } from 'react-intersection-observer';
import { useMemo } from 'react';

function GlobalFeed() {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useGlobalFeed();
  const { ref, inView } = useInView();

  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Remove duplicate events by ID
  const posts = useMemo(() => {
    const seen = new Set();
    return data?.pages.flat().filter(event => {
      if (!event.id || seen.has(event.id)) return false;
      seen.add(event.id);
      return true;
    }) || [];
  }, [data?.pages]);

  return (
    <div className="space-y-4">
      {posts.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
      {hasNextPage && (
        <div ref={ref} className="py-4">
          {isFetchingNextPage && <Skeleton className="h-20 w-full" />}
        </div>
      )}
    </div>
  );
}
```
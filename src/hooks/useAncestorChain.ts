import { useNostr } from '@nostrify/react';
import { type QueryClient, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';

import { fetchEventById } from '@/hooks/useEvent';
import { useNostrStorage } from '@/hooks/useNostrStorage';
import { getParentEventHints, type ParentEventHints } from '@/lib/nostrEvents';
import { isNostrId } from '@/lib/nostrId';

/** Per-scheme cap on the thread replies prefetched by root. */
const THREAD_PREFETCH_LIMIT = 100;

export interface AncestorChain {
  /** Top-most first, direct parent last. */
  events: NostrEvent[];
  /** False while higher levels are still loading. */
  complete: boolean;
  /** The next level up, which couldn't be found. */
  missing?: ParentEventHints;
  /** The next level up, beyond `maxLevels`. */
  more?: ParentEventHints;
}

/** The chain as far as the `['event', id]` seeds reach. */
function seededChain(queryClient: QueryClient, parent: ParentEventHints | undefined, maxLevels: number): AncestorChain | undefined {
  const events: NostrEvent[] = [];
  let next = parent;
  while (next) {
    if (events.length >= maxLevels) return { events, complete: true, more: next };
    const event = queryClient.getQueryData<NostrEvent>(['event', next.id]);
    if (!event || events.some((e) => e.id === event.id)) break;
    events.unshift(event);
    next = getParentEventHints(event);
  }
  if (events.length === 0) return undefined;
  return { events, complete: !next };
}

function firstFound(a: Promise<NostrEvent | null>, b: Promise<NostrEvent | null>): Promise<NostrEvent | null> {
  return new Promise((resolve) => {
    let misses = 0;
    for (const attempt of [a, b]) {
      attempt.then(
        (event) => (event ? resolve(event) : ++misses === 2 && resolve(null)),
        () => ++misses === 2 && resolve(null),
      );
    }
  });
}

/**
 * Walks a reply's parent chain up to the thread root, publishing each level as
 * it's found. A prefetch of the root's replies races the per-level lookups.
 */
export function useAncestorChain(parent: ParentEventHints | undefined, rootId: string | undefined, maxLevels: number) {
  const { nostr } = useNostr();
  const { store } = useNostrStorage();
  const queryClient = useQueryClient();
  const root = rootId && isNostrId(rootId) && rootId !== parent?.id ? rootId : undefined;
  const queryKey = ['ancestor-chain', parent?.id ?? '', parent?.relayHint ?? '', parent?.authorHint ?? '', root ?? '', maxLevels];

  return useQuery<AncestorChain>({
    queryKey,
    queryFn: async ({ signal }) => {
      if (!parent) return { events: [], complete: true };
      const ctx = { nostr, store, queryClient };

      const prefetched = new Map<string, NostrEvent>();
      let prefetchSettled = false;
      const prefetch = !root || maxLevels <= 1
        ? Promise.resolve()
        : nostr.query([
          { ids: [root] },
          { kinds: [1, 1222], '#e': [root], limit: THREAD_PREFETCH_LIMIT },
          { kinds: [1111, 1244], '#E': [root], limit: THREAD_PREFETCH_LIMIT },
        ] satisfies NostrFilter[], { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) }).then(
          (events) => { for (const event of events) prefetched.set(event.id, event); },
          () => { /* every level still has its own lookup */ },
        );
      void prefetch.finally(() => { prefetchSettled = true; });

      const lookup = (hints: ParentEventHints): Promise<NostrEvent | null> => {
        const hit = prefetched.get(hints.id);
        if (hit) {
          if (!queryClient.getQueryData(['event', hit.id])) queryClient.setQueryData(['event', hit.id], hit);
          return Promise.resolve(hit);
        }
        const direct = fetchEventById(ctx, hints.id, hints.relayHint ? [hints.relayHint] : undefined, hints.authorHint);
        if (prefetchSettled) return direct;
        return firstFound(direct, prefetch.then(() => prefetched.get(hints.id) ?? null));
      };

      const events: NostrEvent[] = [];
      const seen = new Set<string>();
      let next: ParentEventHints | undefined = parent;
      while (next && !signal.aborted) {
        if (events.length >= maxLevels) return { events, complete: true, more: next };
        if (seen.has(next.id)) break;
        seen.add(next.id);

        const event = await lookup(next);
        if (!event) return { events, complete: true, missing: next };

        events.unshift(event);
        next = getParentEventHints(event);
        const shown = queryClient.getQueryData<AncestorChain>(queryKey);
        if (next && (shown?.events.length ?? 0) < events.length) {
          queryClient.setQueryData<AncestorChain>(queryKey, { events: [...events], complete: false });
        }
      }
      return { events, complete: true };
    },
    // A partial seed is marked stale so the walk still runs.
    initialData: () => seededChain(queryClient, parent, maxLevels),
    initialDataUpdatedAt: () => (seededChain(queryClient, parent, maxLevels)?.complete ? Date.now() : 0),
    enabled: !!parent,
    staleTime: 5 * 60 * 1000,
    // Keep the shown levels while expanding, but never another post's chain.
    placeholderData: (prev, prevQuery) => (prevQuery?.queryKey[1] === parent?.id ? prev : undefined),
  });
}

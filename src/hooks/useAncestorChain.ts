import { useNostr } from '@nostrify/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';

import { fetchEventById } from '@/hooks/useEvent';
import { useNostrStorage } from '@/hooks/useNostrStorage';
import { getParentEventHints, type ParentEventHints } from '@/lib/nostrEvents';
import { isNostrId } from '@/lib/nostrId';

/** Most replies fetched up front to fill in a thread's middle levels. */
const THREAD_PREFETCH_LIMIT = 300;

export interface AncestorChain {
  /** Ancestors in reading order: the top-most first, the direct parent last. */
  events: NostrEvent[];
  /** The ancestor above `events[0]` that couldn't be found. */
  missing?: ParentEventHints;
  /** The ancestor above `events[0]` that wasn't fetched because `maxLevels` was reached. */
  more?: ParentEventHints;
}

/**
 * Walks a reply's parent chain up to the thread root in a single query, so a
 * thread renders all at once instead of one level at a time.
 *
 * When the thread root is known, one request first pulls the thread's replies
 * (NIP-10 `#e` and NIP-22 `#E`), which usually covers every middle level; any
 * level it misses falls back to a full {@link fetchEventById} lookup. Found
 * events are seeded under `['event', id]` like any other lookup.
 *
 * @param parent The focused event's parent.
 * @param rootId The thread root's id, if the focused event names one.
 * @param maxLevels How many ancestors to walk before stopping.
 */
export function useAncestorChain(parent: ParentEventHints | undefined, rootId: string | undefined, maxLevels: number) {
  const { nostr } = useNostr();
  const { store } = useNostrStorage();
  const queryClient = useQueryClient();
  const root = rootId && isNostrId(rootId) && rootId !== parent?.id ? rootId : undefined;

  return useQuery<AncestorChain>({
    queryKey: ['ancestor-chain', parent?.id ?? '', parent?.relayHint ?? '', parent?.authorHint ?? '', root ?? '', maxLevels],
    queryFn: async () => {
      if (!parent) return { events: [] };
      const ctx = { nostr, store, queryClient };

      // The thread prefetch runs alongside the walk rather than ahead of it:
      // it only settles once the slowest relay answers, and the walk shouldn't
      // wait on that when per-level lookups are coming back sooner.
      const prefetched = new Map<string, NostrEvent>();
      let prefetchSettled = false;
      const prefetch = !root || maxLevels <= 1
        ? Promise.resolve()
        : nostr.query([
          { ids: [root] },
          { kinds: [1, 1222], '#e': [root], limit: THREAD_PREFETCH_LIMIT },
          { kinds: [1111, 1244], '#E': [root], limit: THREAD_PREFETCH_LIMIT },
        ] satisfies NostrFilter[], { signal: AbortSignal.timeout(5000) }).then(
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
        // Whichever answers first; a prefetch miss defers to the direct lookup.
        return Promise.race([direct, prefetch.then(() => prefetched.get(hints.id) ?? direct)]);
      };

      const events: NostrEvent[] = [];
      const seen = new Set<string>();
      let next: ParentEventHints | undefined = parent;
      while (next) {
        if (events.length >= maxLevels) return { events, more: next };
        if (seen.has(next.id)) break;
        seen.add(next.id);

        const event = await lookup(next);
        if (!event) return { events, missing: next };

        events.unshift(event);
        next = getParentEventHints(event);
      }
      return { events };
    },
    // A chain whose every level is already in memory renders without a spinner.
    initialData: () => {
      const events: NostrEvent[] = [];
      let next = parent;
      while (next) {
        if (events.length >= maxLevels) return { events, more: next };
        const event = queryClient.getQueryData<NostrEvent>(['event', next.id]);
        if (!event || events.some((e) => e.id === event.id)) return undefined;
        events.unshift(event);
        next = getParentEventHints(event);
      }
      return { events };
    },
    enabled: !!parent,
    staleTime: 5 * 60 * 1000,
    // Expanding a collapsed chain keeps the levels already on screen while the
    // rest loads. Another post's chain must never stand in, though.
    placeholderData: (prev, prevQuery) => (prevQuery?.queryKey[1] === parent?.id ? prev : undefined),
  });
}

import type { NostrEvent } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useCacheFirstSeed } from '@/hooks/useCacheFirstSeed';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useNostrStorage } from '@/hooks/useNostrStorage';
import { fetchFreshEvent } from '@/lib/fetchFreshEvent';
import { optimisticPatchEventTags, rollbackEvent } from '@/lib/optimisticEvent';
import {
  nextQuickReactionTags,
  QUICK_REACTIONS_KIND,
  type ListedQuickReaction,
} from '@/lib/quickReactions';

/** Thrown when the list moved since the row the user edited was shown. */
export class QuickReactionsChangedError extends Error {
  constructor() {
    super('Your quick reactions changed on another device. Check them and try again.');
  }
}

/**
 * The user's kind-10077 quick-reaction list: `undefined` until the first read
 * settles, `null` when they have none.
 */
export function useQuickReactionList(): NostrEvent | null | undefined {
  const { nostr } = useNostr();
  const { store } = useNostrStorage();
  const { user } = useCurrentUser();
  const queryKey = ['quick-reactions', user?.pubkey ?? ''];

  useCacheFirstSeed<NostrEvent | null>({
    queryKey: user ? queryKey : undefined,
    filter: { kinds: [QUICK_REACTIONS_KIND], authors: user ? [user.pubkey] : [] },
    toData: (event) => event,
    getEvent: (data) => data ?? undefined,
  });

  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) =>
      fetchFreshEvent(nostr, { kinds: [QUICK_REACTIONS_KIND], authors: [user!.pubkey] }, { store, signal }),
    enabled: !!user,
    staleTime: 5 * 60_000,
  });

  return query.data;
}

/**
 * Publish `reactions` as the user's whole quick-reaction list. The row the
 * user edited was built from `basis` (the list event id it showed, or null for
 * none), so a newer list on the relays refuses rather than replacing what the
 * user never saw.
 */
export function usePublishQuickReactions() {
  const { nostr } = useNostr();
  const { store } = useNostrStorage();
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();
  const { mutateAsync: publishEvent } = useNostrPublish();

  return useMutation({
    mutationFn: async ({ reactions, basis }: { reactions: ListedQuickReaction[]; basis: string | null }) => {
      if (!user) throw new Error('Must be logged in');
      const queryKey = ['quick-reactions', user.pubkey];
      // The store floor means a relay miss can't pass for "no list" once we've seen one.
      const prev = await fetchFreshEvent(nostr, { kinds: [QUICK_REACTIONS_KIND], authors: [user.pubkey] }, { store });

      if ((prev?.id ?? null) !== basis) {
        queryClient.setQueryData(queryKey, prev);
        throw new QuickReactionsChangedError();
      }

      const now = Math.floor(Date.now() / 1000);
      const event = await publishEvent({
        kind: QUICK_REACTIONS_KIND,
        content: prev?.content ?? '',
        tags: nextQuickReactionTags(prev, reactions),
        created_at: prev ? Math.max(now, prev.created_at + 1) : now,
        prev: prev ?? undefined,
      });
      queryClient.setQueryData(queryKey, event);
    },
    // Show the new row while it publishes, so it doesn't snap back meanwhile.
    onMutate: ({ reactions }) => {
      const key = ['quick-reactions', user?.pubkey ?? ''];
      const snapshot = optimisticPatchEventTags(queryClient, key, {
        kind: QUICK_REACTIONS_KIND,
        pubkey: user?.pubkey ?? '',
        transform: (tags) => nextQuickReactionTags({ tags }, reactions),
      });
      return { key, snapshot };
    },
    onError: (error, _vars, ctx) => {
      // A changed list already put the relays' version in the cache.
      if (ctx && !(error instanceof QuickReactionsChangedError)) rollbackEvent(queryClient, ctx.key, ctx.snapshot);
    },
  });
}

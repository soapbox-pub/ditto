import { useNostr } from '@nostrify/react';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrStorage } from '@/hooks/useNostrStorage';
import { mergeStreaks, parseStreakEvent, STREAK_KIND, type Streak } from '@/lib/streak';

export function streakQueryKey(pubkey: string) {
  return ['streak', pubkey] as const;
}

/**
 * Fold streak events into the cached streak for a pubkey. Merging (rather than
 * replacing) means a relay still holding an older copy can't knock a fresher
 * local or optimistic value back down.
 */
export function mergeStreakIntoCache(
  queryClient: QueryClient,
  pubkey: string,
  events: (NostrEvent | Streak | undefined)[],
): Streak | undefined {
  let merged = queryClient.getQueryData<Streak | null>(streakQueryKey(pubkey)) ?? undefined;
  for (const item of events) {
    merged = mergeStreaks(merged, item && 'kind' in item ? parseStreakEvent(item) : item);
  }
  queryClient.setQueryData(streakQueryKey(pubkey), merged ?? null);
  return merged;
}

/**
 * A user's self-reported posting streak (kind 13473, see NIP.md). With
 * `enabled: false` it only reads what another query seeded into the cache.
 */
export function useStreak(pubkey: string | undefined, { enabled = true }: { enabled?: boolean } = {}) {
  const { nostr } = useNostr();
  const { store } = useNostrStorage();
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();

  return useQuery<Streak | null>({
    queryKey: streakQueryKey(pubkey ?? ''),
    queryFn: async ({ signal }) => {
      if (!pubkey) return null;
      const filter = { kinds: [STREAK_KIND], authors: [pubkey], limit: 1 };
      const [remote, local] = await Promise.all([
        nostr.query([filter], { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) }),
        pubkey === user?.pubkey ? store.query([filter]) : Promise.resolve([]),
      ]);
      return mergeStreakIntoCache(queryClient, pubkey, [...remote, ...local]) ?? null;
    },
    enabled: enabled && !!pubkey,
    staleTime: 5 * 60 * 1000,
  });
}

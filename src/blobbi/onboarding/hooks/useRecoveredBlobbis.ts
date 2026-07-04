import { useMemo } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';

import { KIND_BLOBBI_STATE, type BlobbiCompanion } from '@blobbi-kit/core/blobbi';
import { recoverInteropCompanions } from '../lib/interop-recovery';

/**
 * Fallback hook that recovers displayable interop Blobbis (e.g. Blobbi
 * Island-created) that the strict `useBlobbisCollection` dropped as "legacy".
 *
 * It only runs when the strict collection has finished loading and returned NO
 * companions (`enabled`), so the common path stays on the strict collection and
 * this never adds an extra relay round-trip for users whose Blobbis display
 * normally.
 *
 * The query mirrors the preflight guard: `{ kinds: [31124], authors }` WITHOUT
 * the `#b` filter, then client-side recovery via `recoverInteropCompanions`
 * (which is conservative — genuine old-app events are still excluded).
 */
export function useRecoveredBlobbis(
  pubkey: string | undefined,
  enabled: boolean,
): { companions: BlobbiCompanion[]; isLoading: boolean; isFetching: boolean } {
  const { nostr } = useNostr();

  const query = useQuery({
    queryKey: ['blobbi-recovery', pubkey],
    queryFn: async ({ signal }) => {
      if (!pubkey) return [] as BlobbiCompanion[];
      const events = await nostr.query(
        [{ kinds: [KIND_BLOBBI_STATE], authors: [pubkey] }],
        { signal },
      );
      return recoverInteropCompanions(events);
    },
    enabled: !!pubkey && enabled,
    staleTime: 30_000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    retry: 2,
  });

  const companions = useMemo(() => query.data ?? [], [query.data]);

  return {
    companions,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
  };
}

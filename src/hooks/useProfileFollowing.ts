import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';

/**
 * Hook to fetch a user's follow list (kind 3) and extract the pubkeys they follow.
 * Works for any pubkey, not just the logged-in user.
 */
export function useProfileFollowing(pubkey: string | undefined) {
  const { nostr } = useNostr();

  return useQuery({
    queryKey: ['profile-following', pubkey],
    queryFn: async ({ signal }) => {
      if (!pubkey) return { pubkeys: [], count: 0 };
      const [event] = await nostr.query(
        [{ kinds: [3], authors: [pubkey], limit: 1 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) },
      );
      if (!event) return { pubkeys: [], count: 0 };
      const pubkeys = event.tags
        .filter(([name]) => name === 'p')
        .map(([, pk]) => pk);
      return { pubkeys, count: pubkeys.length };
    },
    enabled: !!pubkey,
    staleTime: 5 * 60 * 1000,
  });
}

import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';

export interface UserStatus {
  /** The status text, or null if no status / expired / cleared. */
  status: string | null;
  /** Optional URL linked from the status (from `r` tag). */
  url: string | null;
}

/**
 * Query a user's NIP-38 general status (kind 30315, d="general").
 *
 * Handles expiration: if the event has an `expiration` tag whose
 * timestamp has passed, the status is treated as cleared.
 */
export function useUserStatus(pubkey: string | undefined): UserStatus & { isLoading: boolean } {
  const { nostr } = useNostr();

  const query = useQuery({
    queryKey: ['user-status', pubkey ?? ''],
    queryFn: async ({ signal }) => {
      if (!pubkey) return { status: null, url: null };

      const events = await nostr.query(
        [{ kinds: [30315], authors: [pubkey], '#d': ['general'], limit: 1 }],
        { signal },
      );

      if (events.length === 0) return { status: null, url: null };

      const event = events[0];

      // Check NIP-40 expiration
      const expTag = event.tags.find(([n]) => n === 'expiration')?.[1];
      if (expTag) {
        const expTime = parseInt(expTag, 10);
        if (!isNaN(expTime) && Math.floor(Date.now() / 1000) > expTime) {
          return { status: null, url: null };
        }
      }

      // Empty content = status cleared
      const content = event.content.trim();
      if (!content) return { status: null, url: null };

      const url = event.tags.find(([n]) => n === 'r')?.[1] ?? null;

      return { status: content, url };
    },
    enabled: !!pubkey,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });

  return {
    status: query.data?.status ?? null,
    url: query.data?.url ?? null,
    isLoading: query.isLoading,
  };
}

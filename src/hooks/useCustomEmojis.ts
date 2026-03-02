import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';

import { useCurrentUser } from '@/hooks/useCurrentUser';

export interface CustomEmoji {
  shortcode: string;
  url: string;
}

/**
 * Query the current user's NIP-30 custom emoji list (kind 10030).
 *
 * Extracts all `['emoji', shortcode, url]` tags from the user's
 * replaceable emoji list event. Returns an empty array if the user
 * has no emoji list or is not logged in.
 */
export function useCustomEmojis() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();

  const query = useQuery({
    queryKey: ['custom-emojis', user?.pubkey ?? ''],
    queryFn: async ({ signal }) => {
      if (!user) return [];

      const events = await nostr.query(
        [{ kinds: [10030], authors: [user.pubkey], limit: 1 }],
        { signal },
      );

      if (events.length === 0) return [];

      const emojis: CustomEmoji[] = [];
      for (const tag of events[0].tags) {
        if (tag[0] === 'emoji' && tag[1] && tag[2]) {
          emojis.push({ shortcode: tag[1], url: tag[2] });
        }
      }
      return emojis;
    },
    enabled: !!user,
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
  });

  return {
    emojis: query.data ?? [],
    isLoading: query.isLoading,
  };
}

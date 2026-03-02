import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';

import { useCurrentUser } from '@/hooks/useCurrentUser';

export interface CustomEmoji {
  shortcode: string;
  url: string;
}

/** Well-known relays that commonly store replaceable list events like kind 10030. */
const EMOJI_RELAYS = [
  'wss://relay.ditto.pub/',
  'wss://relay.primal.net/',
  'wss://relay.damus.io/',
  'wss://nos.lol/',
  'wss://purplepag.es/',
  'wss://relay.nostr.band/',
];

/**
 * Query the current user's NIP-30 custom emoji list (kind 10030).
 *
 * Queries both the default relay pool and well-known profile relays
 * to maximize the chance of finding the user's emoji list. Extracts
 * all `['emoji', shortcode, url]` tags from the most recent event.
 */
export function useCustomEmojis() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();

  const query = useQuery({
    queryKey: ['custom-emojis', user?.pubkey ?? ''],
    queryFn: async ({ signal }) => {
      if (!user) return [];

      // Query both the default pool and a broader relay group in parallel
      const broadGroup = nostr.group(EMOJI_RELAYS);
      const [poolEvents, broadEvents] = await Promise.all([
        nostr.query([{ kinds: [10030], authors: [user.pubkey], limit: 1 }], { signal }).catch(() => []),
        broadGroup.query([{ kinds: [10030], authors: [user.pubkey], limit: 1 }], { signal }).catch(() => []),
      ]);

      // Pick the most recent event across both sources
      const allEvents = [...poolEvents, ...broadEvents];
      if (allEvents.length === 0) return [];

      const latest = allEvents.reduce((a, b) => a.created_at >= b.created_at ? a : b);

      const emojis: CustomEmoji[] = [];
      for (const tag of latest.tags) {
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

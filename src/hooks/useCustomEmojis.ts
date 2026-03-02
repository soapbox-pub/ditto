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
 * Extracts emojis from two sources:
 * 1. Inline `['emoji', shortcode, url]` tags directly in the kind 10030 event
 * 2. Referenced emoji packs via `['a', '30030:pubkey:identifier']` tags —
 *    these kind 30030 events are fetched and their emoji tags are merged in
 */
export function useCustomEmojis() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();

  const query = useQuery({
    queryKey: ['custom-emojis', user?.pubkey ?? ''],
    queryFn: async ({ signal }) => {
      if (!user) return [];

      // Step 1: Fetch the user's kind 10030 emoji list
      const listEvents = await nostr.query(
        [{ kinds: [10030], authors: [user.pubkey], limit: 1 }],
        { signal },
      );

      if (listEvents.length === 0) return [];

      const listEvent = listEvents[0];
      const emojis: CustomEmoji[] = [];
      const seen = new Set<string>();

      // Step 2: Extract inline emoji tags
      for (const tag of listEvent.tags) {
        if (tag[0] === 'emoji' && tag[1] && tag[2] && !seen.has(tag[1])) {
          seen.add(tag[1]);
          emojis.push({ shortcode: tag[1], url: tag[2] });
        }
      }

      // Step 3: Resolve referenced emoji packs (kind 30030)
      const packRefs: { kind: number; pubkey: string; identifier: string }[] = [];
      for (const tag of listEvent.tags) {
        if (tag[0] === 'a' && tag[1]) {
          const parts = tag[1].split(':');
          const kind = parseInt(parts[0], 10);
          if (kind === 30030 && parts[1] && parts[2] !== undefined) {
            packRefs.push({
              kind,
              pubkey: parts[1],
              identifier: parts.slice(2).join(':'),
            });
          }
        }
      }

      if (packRefs.length > 0) {
        // Build filters for all referenced packs
        const filters = packRefs.map((ref) => ({
          kinds: [30030 as number],
          authors: [ref.pubkey],
          '#d': [ref.identifier],
          limit: 1,
        }));

        try {
          const packEvents = await nostr.query(filters, { signal });

          for (const packEvent of packEvents) {
            for (const tag of packEvent.tags) {
              if (tag[0] === 'emoji' && tag[1] && tag[2] && !seen.has(tag[1])) {
                seen.add(tag[1]);
                emojis.push({ shortcode: tag[1], url: tag[2] });
              }
            }
          }
        } catch {
          // Timeout or relay error — return what we have from inline tags
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

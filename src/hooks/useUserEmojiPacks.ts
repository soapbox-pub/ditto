import { useMemo } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

import { useCurrentUser } from './useCurrentUser';

/** A single custom emoji entry resolved from the user's emoji list and packs. */
export interface CustomEmojiEntry {
  /** The shortcode name (without colons). */
  shortcode: string;
  /** URL to the emoji image. */
  url: string;
  /** Name of the pack this emoji belongs to (undefined for standalone emojis). */
  packName?: string;
}

/** Parsed result of the user's emoji configuration. */
export interface UserEmojiPacksData {
  /** The raw kind 10030 event (for reading/updating tags). */
  emojiListEvent?: NostrEvent;
  /** All resolved custom emojis available to the user (standalone + from packs). */
  emojis: CustomEmojiEntry[];
  /** Map of shortcode -> emoji entry for quick lookup. */
  emojiMap: Map<string, CustomEmojiEntry>;
}

/**
 * Fetches and resolves the current user's custom emoji collection.
 *
 * - Queries the user's kind 10030 (emoji list) event
 * - Resolves standalone `emoji` tags into entries
 * - Resolves `a` tag references to kind 30030 emoji packs
 * - Returns a flat list of all available custom emojis
 */
export function useUserEmojiPacks(): { data: UserEmojiPacksData | undefined; isLoading: boolean } {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();

  // 1. Fetch the user's kind 10030 emoji list
  const emojiListQuery = useQuery({
    queryKey: ['user-emoji-packs', 'list', user?.pubkey],
    queryFn: async () => {
      if (!user) return null;
      const events = await nostr.query([{
        kinds: [10030],
        authors: [user.pubkey],
        limit: 1,
      }]);
      return events[0] ?? null;
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  // 2. Extract pack references (a tags pointing to kind 30030 events)
  const packRefs = useMemo(() => {
    if (!emojiListQuery.data) return [];
    return emojiListQuery.data.tags
      .filter(([n, v]) => n === 'a' && v?.startsWith('30030:'))
      .map(([, v]) => {
        const parts = v.split(':');
        return { pubkey: parts[1], identifier: parts.slice(2).join(':') };
      });
  }, [emojiListQuery.data]);

  // 3. Fetch all referenced emoji packs
  const packsQuery = useQuery({
    queryKey: ['user-emoji-packs', 'packs', packRefs],
    queryFn: async () => {
      if (packRefs.length === 0) return [];

      // Build filters for each pack reference
      const filters = packRefs.map((ref) => ({
        kinds: [30030] as number[],
        authors: [ref.pubkey],
        '#d': [ref.identifier],
        limit: 1,
      }));

      // Query all at once (multiple filters in one query)
      const events = await nostr.query(filters);
      return events;
    },
    enabled: packRefs.length > 0,
    staleTime: 60_000,
  });

  // 4. Resolve everything into a flat emoji list
  const data = useMemo((): UserEmojiPacksData | undefined => {
    if (!user) return undefined;

    const emojis: CustomEmojiEntry[] = [];
    const seen = new Set<string>();

    // Standalone emoji tags from kind 10030
    if (emojiListQuery.data) {
      for (const tag of emojiListQuery.data.tags) {
        if (tag[0] === 'emoji' && tag[1] && tag[2] && !seen.has(tag[1])) {
          seen.add(tag[1]);
          emojis.push({ shortcode: tag[1], url: tag[2] });
        }
      }
    }

    // Emojis from referenced packs
    if (packsQuery.data) {
      for (const packEvent of packsQuery.data) {
        const packName = packEvent.tags.find(([n]) => n === 'name')?.[1]
          || packEvent.tags.find(([n]) => n === 'd')?.[1]
          || 'Unnamed Pack';

        for (const tag of packEvent.tags) {
          if (tag[0] === 'emoji' && tag[1] && tag[2] && !seen.has(tag[1])) {
            seen.add(tag[1]);
            emojis.push({ shortcode: tag[1], url: tag[2], packName });
          }
        }
      }
    }

    const emojiMap = new Map(emojis.map((e) => [e.shortcode, e]));

    return {
      emojiListEvent: emojiListQuery.data ?? undefined,
      emojis,
      emojiMap,
    };
  }, [user, emojiListQuery.data, packsQuery.data]);

  return {
    data,
    isLoading: emojiListQuery.isLoading || packsQuery.isLoading,
  };
}

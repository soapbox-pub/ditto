import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
import { parseMusicPlaylist } from '@/lib/musicHelpers';
import { DITTO_RELAYS } from '@/lib/appRelays';

interface UseMusicPlaylistsOptions {
  /** Filter playlists to only these author pubkeys. */
  authors?: string[];
  /** NIP-50 search string (e.g. `"sort:hot"`). When set, queries the Ditto relay. */
  search?: string;
  /** Maximum playlists to fetch (default: 50). */
  limit?: number;
  /** Whether the query should run (default: true). */
  enabled?: boolean;
}

/**
 * Fetches kind 34139 music playlist events.
 *
 * When `authors` is provided, only playlists by those pubkeys are returned.
 * When `search` is provided, queries the Ditto relay with NIP-50 extensions
 * (e.g. `sort:hot` for engagement-weighted ordering).
 * Returns only events that successfully parse via `parseMusicPlaylist()`.
 */
export function useMusicPlaylists(options: UseMusicPlaylistsOptions = {}) {
  const { nostr } = useNostr();
  const { authors, search, limit = 50, enabled = true } = options;

  const authorsKey = authors ? authors.slice().sort().join(',') : 'all';

  return useQuery<NostrEvent[]>({
    queryKey: ['music-playlists', authorsKey, search ?? '', limit],
    queryFn: async ({ signal }) => {
      const filter: Record<string, unknown> = { kinds: [34139], limit };
      if (authors && authors.length > 0) {
        filter.authors = authors;
      }
      if (search) {
        filter.search = search;
      }

      // Use Ditto relay for NIP-50 search queries, default pool otherwise
      const target = search ? nostr.group(DITTO_RELAYS) : nostr;

      const events = await target.query(
        [filter as { kinds: number[]; limit: number; authors?: string[]; search?: string }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]) },
      );

      // Filter to only valid playlists
      return events.filter((ev) => parseMusicPlaylist(ev) !== null);
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    enabled,
    placeholderData: (prev) => prev,
  });
}

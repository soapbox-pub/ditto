import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
import { parseMusicPlaylist } from '@/lib/musicHelpers';

interface UseMusicPlaylistsOptions {
  /** Maximum playlists to fetch (default: 50). */
  limit?: number;
  /** Whether the query should run (default: true). */
  enabled?: boolean;
}

/**
 * Fetches kind 34139 music playlist events.
 *
 * Returns only events that successfully parse via `parseMusicPlaylist()`.
 */
export function useMusicPlaylists(options: UseMusicPlaylistsOptions = {}) {
  const { nostr } = useNostr();
  const { limit = 50, enabled = true } = options;

  return useQuery<NostrEvent[]>({
    queryKey: ['music-playlists', limit],
    queryFn: async ({ signal }) => {
      const events = await nostr.query(
        [{ kinds: [34139], limit }],
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

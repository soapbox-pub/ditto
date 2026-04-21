import { useMemo } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { parseMusicTrack } from '@/lib/musicHelpers';
import { sanitizeUrl } from '@/lib/sanitizeUrl';

/**
 * Parse an `a`-tag ref like `36787:<pubkey>:<d-tag>` into filter components.
 */
function parseATagRef(ref: string): { kind: number; pubkey: string; identifier: string } | null {
  const parts = ref.split(':');
  if (parts.length < 3) return null;
  const kind = parseInt(parts[0], 10);
  if (isNaN(kind)) return null;
  const pubkey = parts[1];
  const identifier = parts.slice(2).join(':');
  if (!pubkey) return null;
  return { kind, pubkey, identifier };
}

/**
 * Lightweight hook to resolve a playlist's cover art.
 *
 * When the playlist has its own artwork, returns that directly.
 * When the playlist has no artwork (or it failed to load), fetches
 * only the **first track** from the playlist's `a`-tag refs and
 * returns its artwork as a fallback.
 *
 * This is much cheaper than resolving all tracks — it issues at most
 * one relay query with a single filter and limit 1.
 *
 * @param playlistArtwork - The playlist's own artwork URL (already sanitized), or undefined.
 * @param trackRefs - The playlist's `a`-tag ref strings.
 * @param enabled - Whether the fallback query should run (default: true).
 *   Pass `false` when the playlist artwork is known-good to skip the query entirely.
 */
export function usePlaylistCoverArt(
  playlistArtwork: string | undefined,
  trackRefs: string[],
  enabled = true,
): string | undefined {
  const { nostr } = useNostr();

  const firstRef = useMemo(() => {
    if (trackRefs.length === 0) return null;
    return parseATagRef(trackRefs[0]);
  }, [trackRefs]);

  const { data: fallbackArt } = useQuery({
    queryKey: ['playlist-cover-fallback', firstRef?.kind, firstRef?.pubkey, firstRef?.identifier],
    queryFn: async ({ signal }) => {
      if (!firstRef) return null;

      const events = await nostr.query(
        [{
          kinds: [firstRef.kind],
          authors: [firstRef.pubkey],
          '#d': [firstRef.identifier],
          limit: 1,
        }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]) },
      );

      if (events.length === 0) return null;

      const parsed = parseMusicTrack(events[0]);
      return parsed?.artwork ?? null;
    },
    enabled: enabled && !playlistArtwork && !!firstRef,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  // Prefer the playlist's own artwork, fall back to the first track's artwork
  return playlistArtwork ?? sanitizeUrl(fallbackArt) ?? undefined;
}

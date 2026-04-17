import { useMemo } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
import { parseMusicTrack } from '@/lib/musicHelpers';

/** A music artist derived from track events. */
export interface MusicArtist {
  pubkey: string;
  trackCount: number;
}

/** Extracted genre with frequency count. */
export interface MusicGenre {
  genre: string;
  count: number;
}

interface UseMusicDataOptions {
  /** Filter tracks to only these author pubkeys. */
  authors?: string[];
  /** Maximum events to fetch (default: 200). */
  limit?: number;
  /** Whether the query should run (default: true). */
  enabled?: boolean;
}

/**
 * Single base query for the music discovery page.
 *
 * Fetches kind 36787 music tracks and derives:
 * - `tracks` — All valid parsed track events
 * - `genres` — Unique genres from `t` tags, sorted by frequency
 * - `artists` — Unique pubkeys with track counts, sorted by count
 *
 * By issuing one query and deriving everything client-side, we avoid
 * redundant relay requests that would otherwise be needed for separate
 * genre and artist hooks.
 */
export function useMusicData(options: UseMusicDataOptions = {}) {
  const { nostr } = useNostr();
  const { authors, limit = 200, enabled = true } = options;

  const authorsKey = authors ? authors.slice().sort().join(',') : 'all';

  const query = useQuery<NostrEvent[]>({
    queryKey: ['music-tracks', authorsKey, limit],
    queryFn: async ({ signal }) => {
      const filter: Record<string, unknown> = { kinds: [36787], limit };
      if (authors && authors.length > 0) {
        filter.authors = authors;
      }

      return nostr.query(
        [filter as { kinds: number[]; limit: number; authors?: string[] }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]) },
      );
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    enabled,
    placeholderData: (prev) => prev,
  });

  // Derive tracks (only those with valid audio URLs)
  const tracks = useMemo(() => {
    if (!query.data) return [];
    return query.data.filter((ev) => parseMusicTrack(ev) !== null);
  }, [query.data]);

  // Derive genres from t tags, excluding the generic "music" tag
  const genres = useMemo((): MusicGenre[] => {
    if (!query.data) return [];
    const counts = new Map<string, number>();

    for (const ev of query.data) {
      for (const tag of ev.tags) {
        if (tag[0] === 't' && tag[1] && tag[1].toLowerCase() !== 'music') {
          const genre = tag[1].toLowerCase();
          counts.set(genre, (counts.get(genre) ?? 0) + 1);
        }
      }
    }

    return Array.from(counts.entries())
      .map(([genre, count]) => ({ genre, count }))
      .sort((a, b) => b.count - a.count);
  }, [query.data]);

  // Derive unique artists with track counts
  const artists = useMemo((): MusicArtist[] => {
    if (!query.data) return [];
    const counts = new Map<string, number>();

    for (const ev of query.data) {
      if (parseMusicTrack(ev) !== null) {
        counts.set(ev.pubkey, (counts.get(ev.pubkey) ?? 0) + 1);
      }
    }

    return Array.from(counts.entries())
      .map(([pubkey, trackCount]) => ({ pubkey, trackCount }))
      .sort((a, b) => b.trackCount - a.trackCount);
  }, [query.data]);

  return {
    ...query,
    tracks,
    genres,
    artists,
  };
}

/**
 * Query music tracks filtered by genre tag.
 *
 * Uses relay-level `#t` filtering for efficiency. Separate from the
 * base useMusicData query because genre-filtered results need their
 * own cache entry and may have different pagination.
 *
 * When `authors` is provided, only tracks by those pubkeys are returned.
 */
export function useMusicTracksByGenre(
  genre: string | null,
  options: { authors?: string[]; enabled?: boolean } = {},
) {
  const { nostr } = useNostr();
  const { authors, enabled = true } = options;

  const authorsKey = authors ? authors.slice().sort().join(',') : 'all';

  return useQuery<NostrEvent[]>({
    queryKey: ['music-tracks-genre', genre, authorsKey],
    queryFn: async ({ signal }) => {
      if (!genre) return [];

      const filter: Record<string, unknown> = { kinds: [36787], '#t': [genre], limit: 50 };
      if (authors && authors.length > 0) {
        filter.authors = authors;
      }

      return nostr.query(
        [filter as { kinds: number[]; '#t': string[]; limit: number; authors?: string[] }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]) },
      );
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    enabled: enabled && !!genre,
    placeholderData: (prev) => prev,
  });
}

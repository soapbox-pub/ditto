import { useMemo } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';
import { parseMusicTrack } from '@/lib/musicHelpers';
import { parseAddr } from '@/lib/parseAddr';

/**
 * Resolve playlist `a`-tag references to actual music track events.
 *
 * Given an array of ref strings (from a playlist's `a` tags), this hook:
 * 1. Parses each ref into `{ kind, pubkey, identifier }`
 * 2. Queries all matching events via a single `nostr.query()` with multiple filters
 * 3. Returns the resolved events sorted in the original playlist order
 * 4. Filters through `parseMusicTrack` to ensure only valid tracks are returned
 */
export function usePlaylistTracks(trackRefs: string[]) {
  const { nostr } = useNostr();

  const parsedRefs = useMemo(
    () => trackRefs.map(parseAddr).filter((r): r is NonNullable<typeof r> => r !== undefined),
    [trackRefs],
  );

  return useQuery({
    queryKey: ['playlist-tracks', trackRefs],
    queryFn: async () => {
      if (parsedRefs.length === 0) return [];

      // Build one filter per unique ref to query all tracks at once
      const filters: NostrFilter[] = parsedRefs.map((ref) => ({
        kinds: [ref.kind],
        authors: [ref.pubkey],
        '#d': [ref.identifier],
        limit: 1,
      }));

      const events = await nostr.query(filters);

      // Build a lookup map: "kind:pubkey:identifier" → event
      const lookup = new Map<string, NostrEvent>();
      for (const ev of events) {
        const d = ev.tags.find(([n]) => n === 'd')?.[1] ?? '';
        const key = `${ev.kind}:${ev.pubkey}:${d}`;
        // Keep the latest event per coordinate
        const existing = lookup.get(key);
        if (!existing || ev.created_at > existing.created_at) {
          lookup.set(key, ev);
        }
      }

      // Return events in original playlist order, filtering out invalid/missing tracks
      const ordered: NostrEvent[] = [];
      for (const ref of parsedRefs) {
        const key = `${ref.kind}:${ref.pubkey}:${ref.identifier}`;
        const ev = lookup.get(key);
        if (ev && parseMusicTrack(ev)) {
          ordered.push(ev);
        }
      }

      return ordered;
    },
    enabled: parsedRefs.length > 0,
    staleTime: 60_000,
  });
}

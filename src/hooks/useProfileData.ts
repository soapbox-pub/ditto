import { useNostr } from '@nostrify/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type NostrEvent, type NostrMetadata, NSchema as n } from '@nostrify/nostrify';
import { parseAuthorEvent } from './useAuthor';

export interface ProfileData {
  /** Kind 0 metadata (parsed). */
  metadata?: NostrMetadata;
  /** Raw kind 0 event. */
  metadataEvent?: NostrEvent;
  /** Pubkeys the profile follows (from kind 3). */
  following: string[];
  /** Raw kind 3 event. */
  followingEvent?: NostrEvent;
  /** Pinned event IDs (from kind 10001 e-tags). */
  pinnedIds: string[];
  /** Raw kind 10001 event. */
  pinnedListEvent?: NostrEvent;
}

/**
 * Fetch profile metadata (kind 0), follow list (kind 3), and pinned notes
 * list (kind 10001) for a pubkey in a single relay query.
 */
export function useProfileData(pubkey: string | undefined) {
  const { nostr } = useNostr();
  const queryClient = useQueryClient();

  return useQuery<ProfileData>({
    queryKey: ['profile-data', pubkey ?? ''],
    queryFn: async ({ signal }) => {
      if (!pubkey) {
        return { following: [], pinnedIds: [] };
      }

      const events = await nostr.query(
        [
          { kinds: [0], authors: [pubkey], limit: 1 },
          { kinds: [3], authors: [pubkey], limit: 1 },
          { kinds: [10001], authors: [pubkey], limit: 1 },
        ],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) },
      );

      const kind0 = events.find((e) => e.kind === 0);
      const kind3 = events.find((e) => e.kind === 3);
      const kind10001 = events.find((e) => e.kind === 10001);

      // Seed individual caches so downstream hooks don't re-fetch
      if (kind0) {
        queryClient.setQueryData(['author', pubkey], parseAuthorEvent(kind0));
      }
      queryClient.setQueryData(['pinned-notes', pubkey], kind10001 ?? null);

      let metadata: NostrMetadata | undefined;
      if (kind0) {
        try {
          metadata = n.json().pipe(n.metadata()).parse(kind0.content);
        } catch {
          // invalid metadata content — leave undefined
        }
      }

      const following = kind3
        ? kind3.tags.filter(([name]) => name === 'p').map(([, pk]) => pk)
        : [];

      const pinnedIds = kind10001
        ? kind10001.tags.filter(([name]) => name === 'e').map(([, id]) => id)
        : [];

      return {
        metadata,
        metadataEvent: kind0,
        following,
        followingEvent: kind3,
        pinnedIds,
        pinnedListEvent: kind10001,
      };
    },
    enabled: !!pubkey,
    staleTime: 5 * 60 * 1000,
  });
}

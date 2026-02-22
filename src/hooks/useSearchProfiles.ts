import { useMemo } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { NSchema as n } from '@nostrify/nostrify';
import type { NostrEvent, NostrMetadata } from '@nostrify/nostrify';
import { useFollowList } from '@/hooks/useFollowActions';

export interface SearchProfile {
  pubkey: string;
  metadata: NostrMetadata;
  event: NostrEvent;
}

/** Search for profiles by username/nip05 using NIP-50 search on relay.ditto.pub. */
export function useSearchProfiles(query: string) {
  const { nostr } = useNostr();
  const { data: followData } = useFollowList();
  const followedPubkeys = useMemo(
    () => new Set(followData?.pubkeys ?? []),
    [followData?.pubkeys],
  );

  const relayResults = useQuery<SearchProfile[]>({
    queryKey: ['search-profiles', query],
    queryFn: async ({ signal }) => {
      if (!query.trim()) return [];

      // NIP-50 profile search (uses pool, reuses existing connections)
      const events = await nostr.query(
        [{ kinds: [0], search: query.trim(), limit: 10 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) },
      );

      const profiles: SearchProfile[] = [];

      for (const event of events) {
        try {
          const metadata = n.json().pipe(n.metadata()).parse(event.content);
          profiles.push({ pubkey: event.pubkey, metadata, event });
        } catch {
          // Skip invalid metadata
        }
      }

      // Deduplicate by pubkey (keep latest event)
      const seen = new Map<string, SearchProfile>();
      for (const profile of profiles) {
        const existing = seen.get(profile.pubkey);
        if (!existing || profile.event.created_at > existing.event.created_at) {
          seen.set(profile.pubkey, profile);
        }
      }

      return Array.from(seen.values());
    },
    enabled: query.trim().length >= 1,
    staleTime: 30 * 1000,
    placeholderData: (prev) => prev,
  });

  // Sort followed profiles ahead of non-followed
  const data = useMemo(() => {
    if (!relayResults.data) return relayResults.data;
    return [...relayResults.data].sort((a, b) => {
      const aFollowed = followedPubkeys.has(a.pubkey) ? 0 : 1;
      const bFollowed = followedPubkeys.has(b.pubkey) ? 0 : 1;
      return aFollowed - bFollowed;
    });
  }, [relayResults.data, followedPubkeys]);

  return {
    ...relayResults,
    data,
    followedPubkeys,
  };
}

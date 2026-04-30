import { useMemo } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { NSchema as n } from '@nostrify/nostrify';
import type { NostrEvent, NostrMetadata } from '@nostrify/nostrify';
import { useFollowList } from '@/hooks/useFollowActions';
import { useDebounce } from '@/hooks/useDebounce';

export interface SearchProfile {
  pubkey: string;
  metadata: NostrMetadata;
  event: NostrEvent;
}

/**
 * Search cached author profiles in the TanStack Query cache.
 * Scans all ['author', pubkey] entries for name/display_name/nip05 matches.
 */
function searchCachedProfiles(
  queryClient: ReturnType<typeof useQueryClient>,
  query: string,
  followedPubkeys: Set<string>,
  limit: number = 10,
): SearchProfile[] {
  const lowerQuery = query.toLowerCase();
  const results: SearchProfile[] = [];

  const cache = queryClient.getQueryCache().findAll({ queryKey: ['author'] });

  for (const entry of cache) {
    const data = entry.state.data as { event?: NostrEvent; metadata?: NostrMetadata } | undefined;
    if (!data?.event || !data?.metadata) continue;

    const { metadata, event } = data;
    const name = metadata.name?.toLowerCase() ?? '';
    const displayName = metadata.display_name?.toLowerCase() ?? '';
    const nip05 = metadata.nip05?.toLowerCase() ?? '';

    if (name.includes(lowerQuery) || displayName.includes(lowerQuery) || nip05.includes(lowerQuery)) {
      results.push({ pubkey: event.pubkey, metadata, event });
    }
  }

  // Sort: followed first, then alphabetical by name
  results.sort((a, b) => {
    const aFollowed = followedPubkeys.has(a.pubkey) ? 0 : 1;
    const bFollowed = followedPubkeys.has(b.pubkey) ? 0 : 1;
    if (aFollowed !== bFollowed) return aFollowed - bFollowed;
    const aName = (a.metadata.name || a.metadata.display_name || '').toLowerCase();
    const bName = (b.metadata.name || b.metadata.display_name || '').toLowerCase();
    return aName.localeCompare(bName);
  });

  return results.slice(0, limit);
}

/** Search for profiles by username/nip05 using NIP-50 search on relay.ditto.pub. */
export function useSearchProfiles(query: string) {
  const { nostr } = useNostr();
  const queryClient = useQueryClient();
  const { data: followData } = useFollowList();
  const followedPubkeys = useMemo(
    () => new Set(followData?.pubkeys ?? []),
    [followData?.pubkeys],
  );

  // Debounce the query so we don't hammer the relay on every keystroke
  const debouncedQuery = useDebounce(query, 300);

  const relayResults = useQuery<SearchProfile[]>({
    queryKey: ['search-profiles', debouncedQuery],
    queryFn: async ({ signal }) => {
      if (!debouncedQuery.trim()) return [];

      // NIP-50 profile search (uses pool, reuses existing connections)
      const events = await nostr.query(
        [{ kinds: [0], search: debouncedQuery.trim(), limit: 10 }],
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
    enabled: debouncedQuery.trim().length >= 1,
    staleTime: 30 * 1000,
    placeholderData: (prev) => prev,
  });

  // Sort followed profiles ahead of non-followed, then fall back to
  // cached author profiles when the relay search returns nothing.
  const data = useMemo(() => {
    const relayData = relayResults.data;

    if (relayData && relayData.length > 0) {
      return [...relayData].sort((a, b) => {
        const aFollowed = followedPubkeys.has(a.pubkey) ? 0 : 1;
        const bFollowed = followedPubkeys.has(b.pubkey) ? 0 : 1;
        return aFollowed - bFollowed;
      });
    }

    // Relay returned nothing — search the local cache instead
    if (debouncedQuery.trim().length >= 1) {
      return searchCachedProfiles(queryClient, debouncedQuery.trim(), followedPubkeys);
    }

    return relayData;
  }, [relayResults.data, followedPubkeys, debouncedQuery, queryClient]);

  return {
    ...relayResults,
    data,
    followedPubkeys,
  };
}

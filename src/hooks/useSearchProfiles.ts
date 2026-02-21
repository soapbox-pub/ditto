import { useMemo } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { NSchema as n } from '@nostrify/nostrify';
import type { NostrEvent, NostrMetadata } from '@nostrify/nostrify';
import { useFollowedProfiles } from '@/hooks/useFollowedProfiles';

export interface SearchProfile {
  pubkey: string;
  metadata: NostrMetadata;
  event: NostrEvent;
}

/** Check if a profile matches a search query by name, display_name, nip05, or about. */
function profileMatchesQuery(metadata: NostrMetadata, query: string): boolean {
  const q = query.toLowerCase();
  const fields = [
    metadata.name,
    metadata.display_name,
    metadata.nip05,
  ];
  return fields.some((field) => field?.toLowerCase().includes(q));
}

/** Search for profiles by username/nip05 using NIP-50 search on relay.ditto.pub. */
export function useSearchProfiles(query: string) {
  const { nostr } = useNostr();
  const { profiles: followedProfiles, pubkeys: followedPubkeys } = useFollowedProfiles();

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

  // Merge followed profiles (client-side matched) ahead of relay results
  const data = useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed) return relayResults.data;

    // Client-side match against followed profiles
    const matchedFollows = followedProfiles.filter((p) =>
      profileMatchesQuery(p.metadata, trimmed),
    );

    const relayProfiles = relayResults.data ?? [];

    // Build merged list: matched follows first, then relay results (no dupes)
    const seen = new Set<string>();
    const merged: SearchProfile[] = [];

    // Add matched follows first
    for (const profile of matchedFollows) {
      if (!seen.has(profile.pubkey)) {
        seen.add(profile.pubkey);
        merged.push(profile);
      }
    }

    // Add relay results, but for followed users move them to follow section
    // (they're already there from above, so just skip dupes)
    // For non-followed relay results, sort followed ones first too
    const remainingFollowed: SearchProfile[] = [];
    const remainingOther: SearchProfile[] = [];

    for (const profile of relayProfiles) {
      if (seen.has(profile.pubkey)) continue;
      seen.add(profile.pubkey);
      if (followedPubkeys.has(profile.pubkey)) {
        remainingFollowed.push(profile);
      } else {
        remainingOther.push(profile);
      }
    }

    merged.push(...remainingFollowed, ...remainingOther);

    return merged;
  }, [query, followedProfiles, followedPubkeys, relayResults.data]);

  return {
    ...relayResults,
    data,
    followedPubkeys,
  };
}

import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { NSchema as n } from '@nostrify/nostrify';
import type { NostrEvent, NostrMetadata } from '@nostrify/nostrify';

export interface SearchProfile {
  pubkey: string;
  metadata: NostrMetadata;
  event: NostrEvent;
}

/** Search for profiles by username/nip05 using NIP-50 search on relay.ditto.pub. */
export function useSearchProfiles(query: string) {
  const { nostr } = useNostr();

  return useQuery<SearchProfile[]>({
    queryKey: ['search-profiles', query],
    queryFn: async ({ signal }) => {
      if (!query.trim()) return [];

      // Use relay.ditto.pub specifically for NIP-50 profile search
      const relay = nostr.relay('wss://relay.ditto.pub');

      const events = await relay.query(
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
}

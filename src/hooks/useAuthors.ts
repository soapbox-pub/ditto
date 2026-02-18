import { type NostrEvent, type NostrMetadata } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { parseAuthorEvent } from '@/hooks/useAuthor';
import { useAppContext } from '@/hooks/useAppContext';
import { getEffectiveRelays } from '@/lib/appRelays';

export interface AuthorData {
  pubkey: string;
  event?: NostrEvent;
  metadata?: NostrMetadata;
}

/**
 * Batch fetch multiple author profiles in a single query.
 * More efficient than calling useAuthor for each pubkey individually.
 * Results are also seeded into the individual ['author', pubkey] cache
 * so that subsequent useAuthor() calls for the same pubkeys are instant.
 * 
 * @param pubkeys - Array of pubkeys to fetch profiles for
 * @returns Query result with map of pubkey -> AuthorData
 */
export function useAuthors(pubkeys: string[]) {
  const { nostr } = useNostr();
  const queryClient = useQueryClient();
  const { config } = useAppContext();

  // Deduplicate and sort for a stable query key
  const uniquePubkeys = [...new Set(pubkeys)].sort();

  return useQuery<Map<string, AuthorData>>({
    queryKey: ['authors', uniquePubkeys.join(',')],
    queryFn: async ({ signal }) => {
      if (uniquePubkeys.length === 0) {
        return new Map();
      }

      // Get the effective relays (same ones used by the pool) - do this inside queryFn
      // so we have the latest relay configuration when the query executes
      const effectiveRelays = getEffectiveRelays(config.relayMetadata, config.useAppRelays);
      const readRelayUrls = effectiveRelays.relays.filter(r => r.read).map(r => r.url);

      const combinedSignal = AbortSignal.any([signal, AbortSignal.timeout(5000)]);

      // Fast path: use the pool (races all relays, returns quickly via EOSE timeout)
      const events = await nostr.query(
        [{ kinds: [0], authors: uniquePubkeys, limit: uniquePubkeys.length }],
        { signal: combinedSignal },
      );

      const authorMap = new Map<string, AuthorData>();
      const found = new Set<string>();

      // Initialize all pubkeys with empty data
      for (const pubkey of uniquePubkeys) {
        authorMap.set(pubkey, { pubkey });
      }

      // Process pool results
      for (const event of events) {
        const parsed = parseAuthorEvent(event);
        authorMap.set(event.pubkey, { pubkey: event.pubkey, ...parsed });
        queryClient.setQueryData(['author', event.pubkey], parsed);
        found.add(event.pubkey);
      }

      // Slow path: for any pubkeys not found by the pool, query each relay individually.
      // This is the "loser's race" - we query the same relays from the pool, but
      // individually with more time (5000ms vs 500ms EOSE timeout).
      const missing = uniquePubkeys.filter(pk => !found.has(pk));
      if (missing.length > 0 && readRelayUrls.length > 0) {
        console.log('[useAuthors] Loser race for', missing.length, 'missing profiles on', readRelayUrls.length, 'relays:', readRelayUrls);
        await new Promise<void>((resolve) => {
          const needed = new Set(missing);
          let pending = readRelayUrls.length;

          for (const url of readRelayUrls) {
            nostr.relay(url).query(
              [{ kinds: [0], authors: missing, limit: missing.length }],
              { signal: combinedSignal },
            ).then((relayEvents) => {
              if (relayEvents.length > 0) {
                console.log('[useAuthors] Found', relayEvents.length, 'profiles on', url);
              }
              for (const event of relayEvents) {
                if (needed.has(event.pubkey)) {
                  const parsed = parseAuthorEvent(event);
                  authorMap.set(event.pubkey, { pubkey: event.pubkey, ...parsed });
                  queryClient.setQueryData(['author', event.pubkey], parsed);
                  needed.delete(event.pubkey);
                }
              }
              if (needed.size === 0) resolve();
              if (--pending === 0) resolve();
            }).catch((err) => {
              console.warn('[useAuthors] Relay failed:', url, err);
              if (--pending === 0) resolve();
            });
          }
        });
        console.log('[useAuthors] Loser race complete, still missing:', needed.size);
      }

      return authorMap;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    enabled: uniquePubkeys.length > 0,
    placeholderData: (prev) => prev,
  });
}

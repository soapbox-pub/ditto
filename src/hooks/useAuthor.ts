import { type NostrEvent, type NostrMetadata, NSchema as n } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { APP_RELAYS } from '@/lib/appRelays';

/** Fallback relay URLs used when the pool's EOSE timeout returns empty. */
const PROFILE_RELAYS = APP_RELAYS.relays.map(r => r.url);

/** Parse a kind-0 event into metadata + event, or return just the event on parse failure. */
export function parseAuthorEvent(event: NostrEvent): { event: NostrEvent; metadata?: NostrMetadata } {
  try {
    const metadata = n.json().pipe(n.metadata()).parse(event.content);
    return { metadata, event };
  } catch {
    return { event };
  }
}

export function useAuthor(pubkey: string | undefined) {
  const { nostr } = useNostr();

  return useQuery<{ event?: NostrEvent; metadata?: NostrMetadata }>({
    queryKey: ['author', pubkey ?? ''],
    queryFn: async ({ signal }) => {
      const combinedSignal = AbortSignal.any([signal, AbortSignal.timeout(5000)]);

      // Fast path: use the pool (races all relays, returns quickly via EOSE timeout)
      const [event] = await nostr.query(
        [{ kinds: [0], authors: [pubkey!], limit: 1 }],
        { signal: combinedSignal },
      );

      if (event) {
        return parseAuthorEvent(event);
      }

      // Slow path (losers bracket): pool returned empty because EOSE timeout
      // cut off slower relays. Query each relay individually and resolve on
      // the first hit.
      return new Promise<{ event?: NostrEvent; metadata?: NostrMetadata }>((resolve) => {
        let settled = false;
        let pending = PROFILE_RELAYS.length;

        for (const url of PROFILE_RELAYS) {
          nostr.relay(url).query(
            [{ kinds: [0], authors: [pubkey!], limit: 1 }],
            { signal: combinedSignal },
          ).then((events) => {
            if (settled) return;
            if (events.length > 0) {
              settled = true;
              resolve(parseAuthorEvent(events[0]));
            } else if (--pending === 0) {
              resolve({});
            }
          }).catch(() => {
            if (settled) return;
            if (--pending === 0) resolve({});
          });
        }
      });
    },
    enabled: !!pubkey,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 1,
  });
}

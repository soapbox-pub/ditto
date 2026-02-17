import { useNostr } from '@nostrify/react';
import { useState, useEffect } from 'react';
import type { NostrEvent } from '@nostrify/nostrify';

/**
 * Generic streaming hook that fetches an initial batch of events for a given
 * kind and then streams new ones in real-time.
 *
 * Handles deduplication for both regular events (by id) and addressable
 * events (by pubkey+kind+d).
 */
export function useStreamKind(kind: number) {
  const { nostr } = useNostr();
  const [events, setEvents] = useState<NostrEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const isAddressable = kind >= 30000 && kind < 40000;

  useEffect(() => {
    const ac = new AbortController();
    let alive = true;

    setEvents([]);
    setIsLoading(true);

    const eventMap = new Map<string, NostrEvent>();

    function dedupeKey(event: NostrEvent): string {
      if (isAddressable) {
        const dTag = event.tags.find(([name]) => name === 'd')?.[1] ?? '';
        return `${event.pubkey}:${event.kind}:${dTag}`;
      }
      return event.id;
    }

    function addEvent(event: NostrEvent) {
      if (!alive) return;
      if (event.kind !== kind) return;

      const now = Math.floor(Date.now() / 1000);
      if (event.created_at > now) return;

      const key = dedupeKey(event);
      const existing = eventMap.get(key);
      if (existing && existing.created_at >= event.created_at) return;

      eventMap.set(key, event);
      setEvents(Array.from(eventMap.values()).sort((a, b) => b.created_at - a.created_at));
    }

    const relay = nostr.relay('wss://relay.ditto.pub');
    const filter = { kinds: [kind] };

    // 1. Fetch initial batch
    (async () => {
      try {
        const results = await relay.query(
          [{ ...filter, limit: 40 }],
          { signal: ac.signal },
        );
        for (const event of results) {
          addEvent(event);
        }
      } catch {
        // abort expected
      }
      if (alive) setIsLoading(false);
    })();

    // 2. Stream new events
    (async () => {
      try {
        const now = Math.floor(Date.now() / 1000);
        for await (const msg of relay.req(
          [{ ...filter, since: now, limit: 100 }],
          { signal: ac.signal },
        )) {
          if (!alive) break;
          if (msg[0] === 'EVENT') {
            addEvent(msg[2]);
          } else if (msg[0] === 'CLOSED') {
            break;
          }
        }
      } catch {
        // abort expected
      }
    })();

    return () => {
      alive = false;
      ac.abort();
    };
  }, [nostr, kind, isAddressable]);

  return { events, isLoading };
}

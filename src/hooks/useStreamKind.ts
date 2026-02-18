import { useNostr } from '@nostrify/react';
import { useState, useEffect, useMemo } from 'react';
import type { NostrEvent } from '@nostrify/nostrify';

/**
 * Generic streaming hook that fetches an initial batch of events for the given
 * kind(s) and then streams new ones in real-time.
 *
 * Handles deduplication for both regular events (by id) and addressable
 * events (by pubkey+kind+d).
 *
 * Accepts a single kind number or an array of kinds.
 */
export function useStreamKind(kind: number | number[]) {
  const { nostr } = useNostr();
  const [events, setEvents] = useState<NostrEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Normalise to a stable array
  const kinds = useMemo(
    () => (Array.isArray(kind) ? kind : [kind]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(Array.isArray(kind) ? kind.slice().sort() : [kind])],
  );

  const kindsSet = useMemo(() => new Set(kinds), [kinds]);

  useEffect(() => {
    if (kinds.length === 0) {
      setEvents([]);
      setIsLoading(false);
      return;
    }

    const ac = new AbortController();
    let alive = true;

    setEvents([]);
    setIsLoading(true);

    const eventMap = new Map<string, NostrEvent>();

    function isAddressable(k: number): boolean {
      return k >= 30000 && k < 40000;
    }

    function dedupeKey(event: NostrEvent): string {
      if (isAddressable(event.kind)) {
        const dTag = event.tags.find(([name]) => name === 'd')?.[1] ?? '';
        return `${event.pubkey}:${event.kind}:${dTag}`;
      }
      return event.id;
    }

    function addEvent(event: NostrEvent) {
      if (!alive) return;
      if (!kindsSet.has(event.kind)) return;

      const now = Math.floor(Date.now() / 1000);
      if (event.created_at > now) return;

      const key = dedupeKey(event);
      const existing = eventMap.get(key);
      if (existing && existing.created_at >= event.created_at) return;

      eventMap.set(key, event);
      setEvents(Array.from(eventMap.values()).sort((a, b) => b.created_at - a.created_at));
    }

    const relay = nostr.relay('wss://relay.ditto.pub');
    const filter = { kinds };

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
  }, [nostr, kinds, kindsSet]);

  return { events, isLoading };
}

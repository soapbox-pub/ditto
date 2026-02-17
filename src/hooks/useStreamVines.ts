import { useNostr } from '@nostrify/react';
import { useState, useEffect } from 'react';
import type { NostrEvent } from '@nostrify/nostrify';

/**
 * Validate that a kind 34236 event has the required structure:
 * - Must have an imeta tag with a url
 * - Must have a d tag
 * - Must not be future-dated
 */
function validateVine(event: NostrEvent): boolean {
  if (event.kind !== 34236) return false;

  const now = Math.floor(Date.now() / 1000);
  if (event.created_at > now) return false;

  // Must have d tag (addressable)
  const dTag = event.tags.find(([name]) => name === 'd');
  if (!dTag?.[1]) return false;

  // Must have imeta with a url
  const imetaTag = event.tags.find(([name]) => name === 'imeta');
  if (!imetaTag) return false;
  const hasUrl = imetaTag.some((part, i) => i > 0 && part.startsWith('url '));
  if (!hasUrl) return false;

  return true;
}

/**
 * Stream kind 34236 (Vine) events from relay.ditto.pub.
 * Fetches initial batch then streams new ones in real-time.
 */
export function useStreamVines() {
  const { nostr } = useNostr();
  const [vines, setVines] = useState<NostrEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const ac = new AbortController();
    let alive = true;

    setVines([]);
    setIsLoading(true);

    const eventMap = new Map<string, NostrEvent>();

    function addEvent(event: NostrEvent) {
      if (!alive) return;
      if (!validateVine(event)) return;

      // Deduplicate addressable events by pubkey+kind+d
      const dTag = event.tags.find(([name]) => name === 'd')?.[1] ?? '';
      const addrKey = `${event.pubkey}:${event.kind}:${dTag}`;
      const existing = eventMap.get(addrKey);
      if (existing && existing.created_at >= event.created_at) return;

      eventMap.set(addrKey, event);
      setVines(Array.from(eventMap.values()).sort((a, b) => b.created_at - a.created_at));
    }

    const relay = nostr.relay('wss://relay.ditto.pub');
    const filter = { kinds: [34236] };

    // 1. Fetch initial batch
    (async () => {
      try {
        const events = await relay.query(
          [{ ...filter, limit: 40 }],
          { signal: ac.signal },
        );
        for (const event of events) {
          addEvent(event);
        }
      } catch {
        // abort expected
      }
      if (alive) setIsLoading(false);
    })();

    // 2. Stream new vines
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
  }, [nostr]);

  return { vines, isLoading };
}

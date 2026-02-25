import { useNostr } from '@nostrify/react';
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import type { NostrEvent } from '@nostrify/nostrify';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';

/** Kind 10312: replaceable presence event for nests rooms. */
const NEST_PRESENCE_KIND = 10312;

/** Presence events are published every 120 seconds. */
const PRESENCE_INTERVAL = 120_000;

/** Presence events older than this are considered stale (144 seconds). */
const PRESENCE_STALENESS = 144;

/**
 * Subscribe to presence events for a nest room (kind 10312).
 * Returns the list of currently-present pubkeys.
 */
export function useNestPresenceCount(aTag: string) {
  const { nostr } = useNostr();
  const [presenceEvents, setPresenceEvents] = useState<NostrEvent[]>([]);

  useEffect(() => {
    if (!aTag) return;

    const ac = new AbortController();
    let alive = true;

    const eventMap = new Map<string, NostrEvent>();

    function addEvent(event: NostrEvent) {
      if (!alive) return;
      if (event.kind !== NEST_PRESENCE_KIND) return;

      const existing = eventMap.get(event.pubkey);
      if (existing && existing.created_at >= event.created_at) return;

      eventMap.set(event.pubkey, event);

      // Filter stale entries
      const now = Math.floor(Date.now() / 1000);
      const fresh = Array.from(eventMap.values()).filter(
        (e) => now - e.created_at < PRESENCE_STALENESS,
      );
      setPresenceEvents(fresh);
    }

    const since = Math.floor(Date.now() / 1000) - PRESENCE_STALENESS;

    // Initial query
    (async () => {
      try {
        const events = await nostr.query(
          [{ kinds: [NEST_PRESENCE_KIND], '#a': [aTag], since, limit: 200 }],
          { signal: ac.signal },
        );
        for (const e of events) addEvent(e);
      } catch {
        // abort expected
      }
    })();

    // Real-time subscription
    (async () => {
      try {
        for await (const msg of nostr.req(
          [{ kinds: [NEST_PRESENCE_KIND], '#a': [aTag], since, limit: 0 }],
          { signal: ac.signal },
        )) {
          if (!alive) break;
          if (msg[0] === 'EVENT') addEvent(msg[2]);
          else if (msg[0] === 'CLOSED') break;
        }
      } catch {
        // abort expected
      }
    })();

    return () => {
      alive = false;
      ac.abort();
    };
  }, [nostr, aTag]);

  const pubkeys = useMemo(
    () => presenceEvents.map((e) => e.pubkey),
    [presenceEvents],
  );

  /** Set of pubkeys that currently have their hand raised. */
  const handsRaised = useMemo(
    () => new Set(
      presenceEvents
        .filter((e) => e.tags.some(([n, v]) => n === 'hand' && v === '1'))
        .map((e) => e.pubkey),
    ),
    [presenceEvents],
  );

  return { presenceEvents, pubkeys, count: pubkeys.length, handsRaised };
}

/**
 * Publish presence events while the user is in a nest room.
 * Also manages the hand-raised state.
 */
export function useNestPresencePublisher(aTag: string, active: boolean) {
  const { user } = useCurrentUser();
  const { mutate: publishEvent } = useNostrPublish();
  const [handRaised, setHandRaised] = useState(false);
  const handRaisedRef = useRef(handRaised);
  handRaisedRef.current = handRaised;

  const publishPresence = useCallback(() => {
    if (!user || !aTag) return;

    const tags: string[][] = [
      ['a', aTag, '', 'root'],
    ];

    if (handRaisedRef.current) {
      tags.push(['hand', '1']);
    }

    publishEvent({
      kind: NEST_PRESENCE_KIND,
      content: '',
      tags,
    });
  }, [user, aTag, publishEvent]);

  // Publish presence on interval while active
  useEffect(() => {
    if (!active || !user) return;

    // Publish immediately
    publishPresence();

    const interval = setInterval(publishPresence, PRESENCE_INTERVAL);
    return () => clearInterval(interval);
  }, [active, user, publishPresence]);

  // Re-publish when hand state changes
  useEffect(() => {
    if (active && user) {
      publishPresence();
    }
  }, [handRaised, active, user, publishPresence]);

  const toggleHand = useCallback(() => {
    setHandRaised((prev) => !prev);
  }, []);

  const lowerHand = useCallback(() => {
    setHandRaised(false);
  }, []);

  return { handRaised, toggleHand, lowerHand };
}

import { useNostr } from '@nostrify/react';
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import type { NostrEvent } from '@nostrify/nostrify';

import { useBackgroundQuiet } from './useBackgroundQuiet';
import { useDiscoverAuthors } from './useDiscoverAuthors';
import { createLiveCursor } from '@/lib/backgroundQuiet';
import { DISCOVER_RELAYS } from '@/lib/discoverNetwork';
import { isHiddenFromPublicFeeds } from '@/lib/nsfw';

/** Batch streamed events into one state commit per this window. */
const COMMIT_DELAY_MS = 250;
/** Cap on events backfilled when a paused stream resumes. */
const RESUME_LIMIT = 100;

/**
 * Generic streaming hook that fetches an initial batch of events for the given
 * kind(s) and then streams new ones in real-time.
 *
 * Handles deduplication for both regular events (by id) and addressable
 * events (by pubkey+kind+d).
 *
 * Accepts a single kind number or an array of kinds.
 *
 * Pass `discover` to restrict the stream to the viewer's Discover network
 * (see {@link useDiscoverAuthors}); nothing loads until the network does.
 */
export function useStreamKind(kind: number | number[], opts: { discover?: boolean } = {}) {
  const { nostr } = useNostr();
  const discover = !!opts.discover;
  const { authors: discoverAuthors, key: discoverKey } = useDiscoverAuthors(discover);
  const authors = discover ? discoverAuthors : undefined;
  const [events, setEvents] = useState<NostrEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Normalise to a stable array
  const kinds = useMemo(
    () => (Array.isArray(kind) ? kind : [kind]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(Array.isArray(kind) ? kind.slice().sort() : [kind])],
  );

  const kindsSet = useMemo(() => new Set(kinds), [kinds]);

  // Deduped events for the current kinds, shared by the initial fetch and the
  // live stream. Commits to state are batched: a busy stream would otherwise
  // re-sort and re-render the whole list for every event.
  const eventMapRef = useRef(new Map<string, NostrEvent>());
  const commitTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const commit = useCallback(() => {
    clearTimeout(commitTimerRef.current);
    commitTimerRef.current = undefined;
    setEvents(Array.from(eventMapRef.current.values()).sort((a, b) => b.created_at - a.created_at));
  }, []);

  const addEvent = useCallback((event: NostrEvent): boolean => {
    if (!kindsSet.has(event.kind)) return false;
    // Kind streams show strangers' posts, so they're public feeds.
    if (isHiddenFromPublicFeeds(event)) return false;

    const now = Math.floor(Date.now() / 1000);
    if (event.created_at > now) return false;

    const key = dedupeKey(event);
    const existing = eventMapRef.current.get(key);
    if (existing && existing.created_at >= event.created_at) return false;

    eventMapRef.current.set(key, event);
    return true;
  }, [kindsSet]);

  // 1. Fetch initial batch (uses pool, reuses existing connections)
  useEffect(() => {
    eventMapRef.current = new Map();
    setEvents([]);

    if (discover && authors === undefined) {
      setIsLoading(true);
      return;
    }
    if (kinds.length === 0 || authors?.length === 0) {
      setIsLoading(false);
      return;
    }

    const ac = new AbortController();
    let alive = true;
    setIsLoading(true);

    (async () => {
      try {
        const results = authors
          ? await nostr.group(DISCOVER_RELAYS).query([{ kinds, authors, limit: 40 }], { signal: ac.signal })
          : await nostr.query([{ kinds, limit: 40 }], { signal: ac.signal });
        if (!alive) return;
        for (const event of results) addEvent(event);
        commit();
      } catch {
        // abort expected
      }
      if (alive) setIsLoading(false);
    })();

    return () => {
      alive = false;
      ac.abort();
    };
  }, [nostr, kinds, discover, authors, addEvent, commit]);

  // 2. Stream new events (uses pool, reuses existing connections; Discover
  // streams go to the Discover relays).
  // Backgrounded the stream closes, then resumes from where it paused (see
  // @/lib/backgroundQuiet); new kinds start from now.
  const quiet = useBackgroundQuiet();
  const cursorRef = useRef(createLiveCursor());
  useEffect(() => {
    if (kinds.length === 0) return;
    if (discover && !authors?.length) return;
    const live = cursorRef.current.next([kinds.join(','), discoverKey].join('|'), quiet);
    if (!live) return;

    const ac = new AbortController();
    let alive = true;
    const relay = authors ? nostr.group(DISCOVER_RELAYS) : nostr;

    (async () => {
      try {
        for await (const msg of relay.req(
          [{ kinds, ...(authors ? { authors } : {}), since: live.since, limit: live.resumed ? RESUME_LIMIT : 0 }],
          { signal: ac.signal },
        )) {
          if (!alive) break;
          if (msg[0] === 'EVENT') {
            if (addEvent(msg[2]) && commitTimerRef.current === undefined) {
              commitTimerRef.current = setTimeout(commit, COMMIT_DELAY_MS);
            }
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
      // Flush anything still batched so pausing doesn't strand it.
      if (commitTimerRef.current !== undefined) commit();
    };
  }, [nostr, kinds, discover, authors, discoverKey, addEvent, commit, quiet]);

  return { events, isLoading };
}

function dedupeKey(event: NostrEvent): string {
  if (event.kind >= 30000 && event.kind < 40000) {
    const dTag = event.tags.find(([name]) => name === 'd')?.[1] ?? '';
    return `${event.pubkey}:${event.kind}:${dTag}`;
  }
  return event.id;
}

import { useNostr } from '@nostrify/react';
import { useState, useEffect, useMemo } from 'react';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';

interface StreamPostsOptions {
  includeReplies: boolean;
  mediaType: 'all' | 'images' | 'videos' | 'vines' | 'none';
}

/** Check if an event has imeta tags with image MIME types. */
function hasImageImeta(event: NostrEvent): boolean {
  return event.tags.some(
    (tag) => tag[0] === 'imeta' && tag.slice(1).some((part) => part.startsWith('m ') && part.split(' ')[1]?.startsWith('image/')),
  );
}

/** Check if an event has imeta tags with video MIME types. */
function hasVideoImeta(event: NostrEvent): boolean {
  return event.tags.some(
    (tag) => tag[0] === 'imeta' && tag.slice(1).some((part) => part.startsWith('m ') && part.split(' ')[1]?.startsWith('video/')),
  );
}

function filterEvent(event: NostrEvent, options: StreamPostsOptions): boolean {
  const now = Math.floor(Date.now() / 1000);
  if (event.created_at > now) return false;

  // Kind 34236 (Vines) pass through — they're already the right type
  if (event.kind === 34236) return true;

  if (!options.includeReplies) {
    if (event.tags.some(([name]) => name === 'e')) return false;
  }

  // For images/videos, verify the imeta tag matches (relay returns kind 1 with any imeta)
  switch (options.mediaType) {
    case 'images': return hasImageImeta(event);
    case 'videos': return hasVideoImeta(event);
    case 'none': return !hasImageImeta(event) && !hasVideoImeta(event);
  }

  return true;
}

/** Build the relay filter for the given media type. */
function buildFilter(mediaType: StreamPostsOptions['mediaType']): NostrFilter {
  switch (mediaType) {
    case 'vines':
      return { kinds: [34236] };
    case 'images':
      return { kinds: [1], '#m': ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif', 'image/svg+xml', 'image/apng'] };
    case 'videos':
      return { kinds: [1], '#m': ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'video/mpeg'] };
    default:
      return { kinds: [1] };
  }
}

/**
 * Stream posts using a direct relay connection.
 * Each media type produces its own unique query so the relay returns
 * the most relevant results for that filter.
 */
export function useStreamPosts(query: string, options: StreamPostsOptions) {
  const { nostr } = useNostr();
  const [allEvents, setAllEvents] = useState<NostrEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // mediaType changes the relay filter, so it must restart the stream
  const { mediaType } = options;

  useEffect(() => {
    const ac = new AbortController();
    let alive = true;

    setAllEvents([]);
    setIsLoading(true);

    const eventMap = new Map<string, NostrEvent>();

    function addEvent(event: NostrEvent) {
      if (!alive) return;
      const now = Math.floor(Date.now() / 1000);
      if (event.created_at > now) return;

      // For addressable events (kind 34236), dedupe by pubkey+kind+d
      if (event.kind === 34236) {
        const dTag = event.tags.find(([name]) => name === 'd')?.[1] ?? '';
        const key = `${event.pubkey}:${event.kind}:${dTag}`;
        const existing = eventMap.get(key);
        if (existing && existing.created_at >= event.created_at) return;
        eventMap.set(key, event);
      } else {
        if (eventMap.has(event.id)) return;
        eventMap.set(event.id, event);
      }

      setAllEvents(Array.from(eventMap.values()).sort((a, b) => b.created_at - a.created_at));
    }

    const relay = nostr.relay('wss://relay.ditto.pub');

    const baseFilter: NostrFilter = buildFilter(mediaType);

    if (query.trim()) {
      baseFilter.search = query.trim();
    }

    // 1. Fetch initial batch
    (async () => {
      try {
        const events = await relay.query(
          [{ ...baseFilter, limit: 40 }],
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

    // 2. Stream new events
    (async () => {
      try {
        const now = Math.floor(Date.now() / 1000);
        for await (const msg of relay.req(
          [{ ...baseFilter, since: now, limit: 100 }],
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
  }, [nostr, query, mediaType]);

  // Apply client-side filters (replies toggle + imeta verification)
  const posts = useMemo(() => {
    return allEvents.filter((event) => filterEvent(event, options));
  }, [allEvents, options.includeReplies, options.mediaType]);

  return { posts, isLoading };
}

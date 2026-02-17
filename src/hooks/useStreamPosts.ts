import { useNostr } from '@nostrify/react';
import { useState, useEffect, useMemo } from 'react';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';

interface StreamPostsOptions {
  includeReplies: boolean;
  mediaType: 'all' | 'images' | 'videos' | 'vines' | 'none';
}

function extractImages(content: string): string[] {
  const urlRegex = /https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp|svg)(\?[^\s]*)?/gi;
  return content.match(urlRegex) || [];
}

function extractVideos(content: string): string[] {
  const urlRegex = /https?:\/\/[^\s]+\.(mp4|webm|mov|avi|mkv)(\?[^\s]*)?/gi;
  return content.match(urlRegex) || [];
}

function filterEvent(event: NostrEvent, options: StreamPostsOptions): boolean {
  const now = Math.floor(Date.now() / 1000);
  if (event.created_at > now) return false;

  // Kind 34236 (Vines) pass through — they're already the right type
  if (event.kind === 34236) return true;

  if (!options.includeReplies) {
    if (event.tags.some(([name]) => name === 'e')) return false;
  }

  if (options.mediaType !== 'all') {
    const hasImages = extractImages(event.content).length > 0;
    const hasVideos = extractVideos(event.content).length > 0;
    switch (options.mediaType) {
      case 'images': return hasImages;
      case 'videos': return hasVideos;
      case 'vines': return false; // kind 1 posts aren't vines
      case 'none': return !hasImages && !hasVideos;
    }
  }

  return true;
}

/**
 * Stream posts using a direct relay connection.
 * When mediaType is 'vines', streams kind 34236 events instead of kind 1.
 * Other filters are applied client-side via useMemo.
 */
export function useStreamPosts(query: string, options: StreamPostsOptions) {
  const { nostr } = useNostr();
  const [allEvents, setAllEvents] = useState<NostrEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Vines filter changes the kind queried, so it must restart the stream
  const isVines = options.mediaType === 'vines';

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

    const baseFilter: NostrFilter = isVines
      ? { kinds: [34236] }
      : { kinds: [1] };

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
  }, [nostr, query, isVines]);

  // Apply client-side filters without restarting the stream
  const posts = useMemo(() => {
    return allEvents.filter((event) => filterEvent(event, options));
  }, [allEvents, options.includeReplies, options.mediaType]);

  return { posts, isLoading };
}

import { useNostr } from '@nostrify/react';
import { useState, useEffect, useMemo } from 'react';
import { useFeedSettings } from './useFeedSettings';
import { getEnabledFeedKinds } from '@/lib/extraKinds';
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

  // Non-kind-1 events (extra kinds) pass through — media filters only apply to kind 1
  if (event.kind !== 1) return true;

  if (!options.includeReplies) {
    if (event.tags.some(([name]) => name === 'e')) return false;
  }

  if (options.mediaType !== 'all') {
    const hasImages = hasImageImeta(event);
    const hasVideos = hasVideoImeta(event);
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
 * Includes extra kinds the user has enabled in feed settings.
 * Other filters are applied client-side via useMemo.
 */
export function useStreamPosts(query: string, options: StreamPostsOptions) {
  const { nostr } = useNostr();
  const { feedSettings } = useFeedSettings();
  const [allEvents, setAllEvents] = useState<NostrEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Vines filter changes the kind queried, so it must restart the stream
  const isVines = options.mediaType === 'vines';

  const extraKinds = getEnabledFeedKinds(feedSettings);
  const extraKindsKey = extraKinds.sort().join(',');

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

      // Addressable events (30000-39999) dedupe by pubkey+kind+d
      if (event.kind >= 30000 && event.kind < 40000) {
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

    // Build the kinds list: either vines-only or kind 1 + enabled extras
    const kinds: number[] = isVines
      ? [34236]
      : [1, ...extraKinds];

    const baseFilter: NostrFilter = { kinds };

    if (query.trim()) {
      baseFilter.search = query.trim();
    }

    // 1. Fetch initial batch (uses pool, reuses existing connections)
    (async () => {
      try {
        const events = await nostr.query(
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

    // 2. Stream new events (uses pool, reuses existing connections)
    (async () => {
      try {
        const now = Math.floor(Date.now() / 1000);
        for await (const msg of nostr.req(
          [{ ...baseFilter, since: now, limit: 0 }],
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
  }, [nostr, query, isVines, extraKindsKey]);

  // Apply client-side filters without restarting the stream
  const posts = useMemo(() => {
    return allEvents.filter((event) => filterEvent(event, options));
  }, [allEvents, options.includeReplies, options.mediaType]);

  return { posts, isLoading };
}

import { useNostr } from '@nostrify/react';
import { useState, useEffect, useRef, useCallback } from 'react';
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

  if (!options.includeReplies) {
    if (event.tags.some(([name]) => name === 'e')) return false;
  }

  if (options.mediaType !== 'all') {
    const hasImages = extractImages(event.content).length > 0;
    const hasVideos = extractVideos(event.content).length > 0;
    switch (options.mediaType) {
      case 'images': return hasImages;
      case 'videos':
      case 'vines': return hasVideos;
      case 'none': return !hasImages && !hasVideos;
    }
  }

  return true;
}

/**
 * Stream posts using a direct relay connection.
 * Uses nostr.relay() to get an NRelay1 instance and calls .req() directly,
 * bypassing the NPool which may not keep subscriptions alive.
 */
export function useStreamPosts(query: string, options: StreamPostsOptions) {
  const { nostr } = useNostr();
  const [posts, setPosts] = useState<NostrEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // Use refs for filter values so the effect doesn't re-run when they change
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const queryRef = useRef(query);
  queryRef.current = query;

  useEffect(() => {
    const ac = new AbortController();
    let alive = true;

    setPosts([]);
    setIsLoading(true);

    const eventMap = new Map<string, NostrEvent>();

    function addEvent(event: NostrEvent) {
      if (!alive) return;
      if (eventMap.has(event.id)) return;
      if (!filterEvent(event, optionsRef.current)) return;
      eventMap.set(event.id, event);
      setPosts(Array.from(eventMap.values()).sort((a, b) => b.created_at - a.created_at));
    }

    // Use a single direct relay connection — NOT the pool
    const relay = nostr.relay('wss://relay.ditto.pub');

    const baseFilter: NostrFilter = { kinds: [1] };
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

    // 2. Open a persistent subscription on the relay directly
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
          // EOSE: keep going
        }
      } catch {
        // abort expected
      }
    })();

    return () => {
      alive = false;
      ac.abort();
    };
  }, [nostr, query]);
  // NOTE: only nostr and query in deps — filter changes apply via ref without restarting the stream

  return { posts, isLoading };
}

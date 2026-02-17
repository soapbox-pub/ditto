import { useNostr } from '@nostrify/react';
import { useState, useEffect, useRef } from 'react';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';

interface StreamPostsOptions {
  includeReplies: boolean;
  mediaType: 'all' | 'images' | 'videos' | 'vines' | 'none';
}

/** Extracts image URLs from note content. */
function extractImages(content: string): string[] {
  const urlRegex = /https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp|svg)(\?[^\s]*)?/gi;
  return content.match(urlRegex) || [];
}

/** Extracts video URLs from note content. */
function extractVideos(content: string): string[] {
  const urlRegex = /https?:\/\/[^\s]+\.(mp4|webm|mov|avi|mkv)(\?[^\s]*)?/gi;
  return content.match(urlRegex) || [];
}

/** Filters an event based on search options. */
function filterEvent(event: NostrEvent, options: StreamPostsOptions): boolean {
  if (!options.includeReplies) {
    if (event.tags.some(([name]) => name === 'e')) {
      return false;
    }
  }

  if (options.mediaType !== 'all') {
    const hasImages = extractImages(event.content).length > 0;
    const hasVideos = extractVideos(event.content).length > 0;

    switch (options.mediaType) {
      case 'images':
        return hasImages;
      case 'videos':
      case 'vines':
        return hasVideos;
      case 'none':
        return !hasImages && !hasVideos;
    }
  }

  return true;
}

/**
 * Stream posts in real-time.
 * 1. Fetches an initial batch via query() (limit: 40).
 * 2. Opens a live req() subscription (limit: 0, since: now) for new posts.
 */
export function useStreamPosts(query: string, options: StreamPostsOptions) {
  const { nostr } = useNostr();
  const [posts, setPosts] = useState<NostrEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // Abort any existing stream
    if (abortRef.current) {
      abortRef.current.abort();
    }

    const ac = new AbortController();
    abortRef.current = ac;

    setPosts([]);
    setIsLoading(true);

    const eventMap = new Map<string, NostrEvent>();

    function addEvent(event: NostrEvent) {
      if (eventMap.has(event.id)) return;
      if (!filterEvent(event, options)) return;
      eventMap.set(event.id, event);
      setPosts(Array.from(eventMap.values()).sort((a, b) => b.created_at - a.created_at));
    }

    // Use relay.ditto.pub for NIP-50 search, otherwise default pool
    const store = query.trim()
      ? nostr.relay('wss://relay.ditto.pub')
      : nostr;

    // Build base filter
    const baseFilter: NostrFilter = { kinds: [1] };
    if (query.trim()) {
      baseFilter.search = query.trim();
    }

    const now = Math.floor(Date.now() / 1000);

    (async () => {
      try {
        // 1. Fetch initial batch
        const initial = await store.query(
          [{ ...baseFilter, limit: 40 }],
          { signal: ac.signal },
        );

        for (const event of initial) {
          addEvent(event);
        }
        setIsLoading(false);

        // 2. Stream new posts going forward
        for await (const msg of store.req([{ ...baseFilter, since: now, limit: 0 }], { signal: ac.signal })) {
          if (msg[0] === 'EVENT') {
            addEvent(msg[2]);
          }
          if (msg[0] === 'CLOSED') {
            break;
          }
        }
      } catch {
        // AbortError is expected on cleanup
      } finally {
        setIsLoading(false);
      }
    })();

    return () => {
      ac.abort();
      abortRef.current = null;
    };
  }, [query, options.includeReplies, options.mediaType, nostr]);

  return { posts, isLoading };
}

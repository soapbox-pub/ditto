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
 * 1. Fetches initial batch via query() in parallel.
 * 2. Opens a live req() subscription for new posts.
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
    let isSubscribed = true;

    setPosts([]);
    setIsLoading(true);

    const eventMap = new Map<string, NostrEvent>();

    function addEvent(event: NostrEvent) {
      if (eventMap.has(event.id)) return;
      if (!filterEvent(event, options)) return;
      eventMap.set(event.id, event);
      if (isSubscribed) {
        setPosts(Array.from(eventMap.values()).sort((a, b) => b.created_at - a.created_at));
      }
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

    // 1. Fetch initial batch
    const fetchInitial = async () => {
      try {
        const signal = AbortSignal.any([ac.signal, AbortSignal.timeout(8000)]);
        const events = await store.query(
          [{ ...baseFilter, limit: 40 }],
          { signal },
        );

        for (const event of events) {
          addEvent(event);
        }
        if (isSubscribed) {
          setIsLoading(false);
        }
      } catch (error) {
        if (error instanceof Error && error.name !== 'AbortError') {
          console.error('Failed to fetch initial posts:', error);
        }
        if (isSubscribed) {
          setIsLoading(false);
        }
      }
    };

    // 2. Stream new posts in real-time
    const streamNew = async () => {
      try {
        const subscription = store.req(
          [{ ...baseFilter, since: now, limit: 100 }],
          { signal: ac.signal },
        );

        for await (const msg of subscription) {
          if (!isSubscribed) break;

          if (msg[0] === 'EVENT') {
            addEvent(msg[2]);
          } else if (msg[0] === 'CLOSED') {
            break;
          }
        }
      } catch (error) {
        if (error instanceof Error && error.name !== 'AbortError') {
          console.error('Failed to maintain stream:', error);
        }
      }
    };

    // Run both in parallel
    fetchInitial();
    streamNew();

    return () => {
      isSubscribed = false;
      ac.abort();
      abortRef.current = null;
    };
  }, [query, options.includeReplies, options.mediaType, nostr]);

  return { posts, isLoading };
}

import { useNostr } from '@nostrify/react';
import { useState, useEffect, useCallback, useRef } from 'react';
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

/** Stream posts in real-time. When a search query is provided, uses NIP-50 on relay.ditto.pub. */
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

    // Reset posts when query/filters change
    setPosts([]);
    setIsLoading(true);

    const eventMap = new Map<string, NostrEvent>();

    // Build filter
    const filter: NostrFilter = { kinds: [1], limit: 0 };
    if (query.trim()) {
      filter.search = query.trim();
    }

    // Use relay.ditto.pub for NIP-50 search, otherwise default pool
    const store = query.trim()
      ? nostr.relay('wss://relay.ditto.pub')
      : nostr;

    // Run the streaming loop
    (async () => {
      try {
        for await (const msg of store.req([filter], { signal: ac.signal })) {
          if (msg[0] === 'EOSE') {
            setIsLoading(false);
            continue;
          }
          if (msg[0] === 'CLOSED') {
            break;
          }
          if (msg[0] === 'EVENT') {
            const event = msg[2];

            if (!filterEvent(event, options)) continue;
            if (eventMap.has(event.id)) continue;

            eventMap.set(event.id, event);
            setPosts(
              Array.from(eventMap.values()).sort((a, b) => b.created_at - a.created_at),
            );
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

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

/** Filters an event based on search options and rejects future-dated events. */
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

const STREAM_RELAYS = ['wss://relay.damus.io', 'wss://relay.primal.net', 'wss://relay.ditto.pub'];

/**
 * Stream posts in real-time using the same pattern as bitmap/clawchat.
 * Fetches initial batch, then opens a persistent req() subscription.
 */
export function useStreamPosts(query: string, options: StreamPostsOptions) {
  const { nostr } = useNostr();
  const [posts, setPosts] = useState<NostrEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const abortController = new AbortController();
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

    const baseFilter: NostrFilter = { kinds: [1] };
    if (query.trim()) {
      baseFilter.search = query.trim();
    }

    const relays = query.trim() ? ['wss://relay.ditto.pub'] : STREAM_RELAYS;

    // Fetch initial messages
    const fetchInitialMessages = async () => {
      try {
        const signal = AbortSignal.any([abortController.signal, AbortSignal.timeout(30000)]);
        const events = await nostr.query(
          [{ ...baseFilter, limit: 40 }],
          { signal, relays },
        );
        for (const event of events) {
          addEvent(event);
        }
        if (isSubscribed) {
          setIsLoading(false);
        }
      } catch (error) {
        if (isSubscribed) {
          setIsLoading(false);
        }
      }
    };

    // Set up real-time subscription
    const subscribeToMessages = async () => {
      try {
        const now = Math.floor(Date.now() / 1000);

        const subscription = nostr.req([
          { ...baseFilter, since: now, limit: 100 }
        ], { signal: abortController.signal, relays });

        for await (const msg of subscription) {
          if (!isSubscribed) break;

          if (msg[0] === 'EVENT') {
            addEvent(msg[2]);
          } else if (msg[0] === 'EOSE') {
            // Subscription continues after EOSE
          } else if (msg[0] === 'CLOSED') {
            break;
          }
        }
      } catch (error) {
        if (error instanceof Error && error.name !== 'AbortError') {
          console.error('Stream subscription error:', error);
        }
      }
    };

    // Start fetching and subscribing in parallel
    fetchInitialMessages();
    subscribeToMessages();

    return () => {
      isSubscribed = false;
      abortController.abort();
    };
  }, [query, options.includeReplies, options.mediaType, nostr]);

  return { posts, isLoading };
}

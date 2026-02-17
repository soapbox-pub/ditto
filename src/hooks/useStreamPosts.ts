import { useNostr } from '@nostrify/react';
import { useState, useEffect, useRef } from 'react';
import type { NostrEvent } from '@nostrify/nostrify';

interface StreamPostsOptions {
  includeReplies: boolean;
  mediaType: 'all' | 'images' | 'videos' | 'vines' | 'none';
}

/** Extracts image URLs from note content. */
function extractImages(content: string): string[] {
  const urlRegex = /https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp|svg)(\?[^\s]*)?/gi;
  const matches = content.match(urlRegex);
  return matches || [];
}

/** Extracts video URLs from note content. */
function extractVideos(content: string): string[] {
  const urlRegex = /https?:\/\/[^\s]+\.(mp4|webm|mov|avi|mkv)(\?[^\s]*)?/gi;
  const matches = content.match(urlRegex);
  return matches || [];
}

/** Filters an event based on search options. */
function filterEvent(event: NostrEvent, options: StreamPostsOptions): boolean {
  // Filter replies
  if (!options.includeReplies) {
    if (event.tags.some(([name]) => name === 'e')) {
      return false;
    }
  }

  // Filter by media type
  if (options.mediaType !== 'all') {
    const images = extractImages(event.content);
    const videos = extractVideos(event.content);
    const hasImages = images.length > 0;
    const hasVideos = videos.length > 0;

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

/** Stream posts in real-time using NIP-50 search on relay.ditto.pub. */
export function useStreamPosts(query: string, options: StreamPostsOptions) {
  const { nostr } = useNostr();
  const [posts, setPosts] = useState<NostrEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const closeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    // Close any existing subscription
    if (closeRef.current) {
      closeRef.current();
      closeRef.current = null;
    }

    // Reset posts when query changes
    setPosts([]);

    // Don't subscribe if query is empty
    if (!query.trim()) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    // Use relay.ditto.pub specifically for NIP-50 post search
    const relay = nostr.relay('wss://relay.ditto.pub');
    
    const eventMap = new Map<string, NostrEvent>();

    // Create a subscription for streaming events
    const sub = relay.req([{ kinds: [1], search: query.trim(), limit: 100 }], {
      onevent(event: NostrEvent) {
        // Check if event passes filters
        if (!filterEvent(event, options)) {
          return;
        }

        // Deduplicate and add to map
        if (!eventMap.has(event.id)) {
          eventMap.set(event.id, event);
          
          // Update posts state with sorted events
          setPosts(Array.from(eventMap.values()).sort((a, b) => b.created_at - a.created_at));
        }
      },
      oneose() {
        setIsLoading(false);
      },
    });

    // Store close function
    closeRef.current = () => sub.close();

    // Cleanup on unmount or query change
    return () => {
      sub.close();
      closeRef.current = null;
    };
  }, [query, options.includeReplies, options.mediaType, nostr]);

  return { posts, isLoading };
}

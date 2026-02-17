import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

interface SearchPostsOptions {
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

/** Search for posts using NIP-50 search on relay.ditto.pub. */
export function useSearchPosts(query: string, options: SearchPostsOptions) {
  const { nostr } = useNostr();

  return useQuery<NostrEvent[]>({
    queryKey: ['search-posts', query, options],
    queryFn: async ({ signal }) => {
      if (!query.trim()) return [];

      // Use relay.ditto.pub specifically for NIP-50 post search
      const relay = nostr.relay('wss://relay.ditto.pub');

      const events = await relay.query(
        [{ kinds: [1], search: query.trim(), limit: 50 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) },
      );

      let filteredEvents = events;

      // Filter replies
      if (!options.includeReplies) {
        filteredEvents = filteredEvents.filter(event => {
          return !event.tags.some(([name]) => name === 'e');
        });
      }

      // Filter by media type
      if (options.mediaType !== 'all') {
        filteredEvents = filteredEvents.filter(event => {
          const images = extractImages(event.content);
          const videos = extractVideos(event.content);
          const hasImages = images.length > 0;
          const hasVideos = videos.length > 0;

          switch (options.mediaType) {
            case 'images':
              return hasImages;
            case 'videos':
              return hasVideos;
            case 'vines':
              // For now, treat vines same as videos (could add duration detection later)
              return hasVideos;
            case 'none':
              return !hasImages && !hasVideos;
            default:
              return true;
          }
        });
      }

      return filteredEvents.sort((a, b) => b.created_at - a.created_at);
    },
    enabled: query.trim().length >= 1,
    staleTime: 30 * 1000,
    placeholderData: (prev) => prev,
  });
}

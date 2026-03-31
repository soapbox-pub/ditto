import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

import { useCurrentUser } from './useCurrentUser';

export interface PublishedArticle {
  id: string;
  eventId: string;
  title: string;
  summary: string;
  content: string;
  image: string;
  tags: string[];
  slug: string;
  publishedAt: number;
  updatedAt: number;
}

function eventToArticle(event: NostrEvent): PublishedArticle {
  const getTag = (name: string) => event.tags.find(t => t[0] === name)?.[1] || '';
  const getTags = (name: string) => event.tags.filter(t => t[0] === name).map(t => t[1]);

  const publishedAtTag = getTag('published_at');
  const publishedAt = publishedAtTag ? parseInt(publishedAtTag) * 1000 : event.created_at * 1000;

  return {
    id: event.id,
    eventId: event.id,
    title: getTag('title'),
    summary: getTag('summary'),
    content: event.content,
    image: getTag('image'),
    tags: getTags('t'),
    slug: getTag('d'),
    publishedAt,
    updatedAt: event.created_at * 1000,
  };
}

export function usePublishedArticles() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();

  const query = useQuery<PublishedArticle[]>({
    queryKey: ['published-articles', user?.pubkey ?? ''],
    queryFn: async ({ signal }) => {
      if (!user?.pubkey) {
        return [];
      }

      const events = await nostr.query(
        [{ kinds: [30023], authors: [user.pubkey] }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) },
      );

      return events
        .filter(e => e.content.trim().length > 0)
        .map(eventToArticle)
        .sort((a, b) => b.publishedAt - a.publishedAt);
    },
    enabled: !!user?.pubkey,
    staleTime: 30 * 1000,
  });

  return {
    articles: query.data || [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

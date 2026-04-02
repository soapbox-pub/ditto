import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

import { useCurrentUser } from './useCurrentUser';
import { parseArticleEvent, type ArticleFields } from '@/lib/articleHelpers';

export interface PublishedArticle extends ArticleFields {
  id: string;
  eventId: string;
  publishedAt: number;
  updatedAt: number;
}

function eventToArticle(event: NostrEvent): PublishedArticle {
  const parsed = parseArticleEvent(event);
  return {
    ...parsed,
    id: event.id,
    eventId: event.id,
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
        [{ kinds: [30023], authors: [user.pubkey], limit: 100 }],
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

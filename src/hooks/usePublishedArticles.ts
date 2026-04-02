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

/**
 * Collect deleted event IDs and addressable-event coordinates from
 * kind 5 deletion request events (NIP-09).
 */
function getDeletedTargets(deletionEvents: NostrEvent[]): { ids: Set<string>; coords: Set<string> } {
  const ids = new Set<string>();
  const coords = new Set<string>();
  for (const event of deletionEvents) {
    for (const [name, value] of event.tags) {
      if (name === 'e' && value) ids.add(value);
      if (name === 'a' && value) coords.add(value);
    }
  }
  return { ids, coords };
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

      const timeout = AbortSignal.timeout(5000);

      // Fetch articles and their deletion events in parallel.
      const [events, deletions] = await Promise.all([
        nostr.query(
          [{ kinds: [30023], authors: [user.pubkey], limit: 100 }],
          { signal: AbortSignal.any([signal, timeout]) },
        ),
        nostr.query(
          [{ kinds: [5], authors: [user.pubkey], '#k': ['30023'], limit: 500 }],
          { signal: AbortSignal.any([signal, timeout]) },
        ),
      ]);

      const { ids: deletedIds, coords: deletedCoords } = getDeletedTargets(deletions);

      // Deduplicate addressable events by d-tag, keeping the newest version.
      // Multiple relays may return different versions of the same article.
      const latestByDTag = new Map<string, NostrEvent>();
      for (const event of events) {
        const dTag = event.tags.find(([name]) => name === 'd')?.[1] ?? '';
        const existing = latestByDTag.get(dTag);
        if (!existing || event.created_at > existing.created_at) {
          latestByDTag.set(dTag, event);
        }
      }

      return Array.from(latestByDTag.values())
        .filter(e => {
          // Skip empty articles
          if (!e.content.trim()) return false;
          // Skip articles deleted by event ID
          if (deletedIds.has(e.id)) return false;
          // Skip articles deleted by addressable coordinate (a-tag)
          const dTag = e.tags.find(([name]) => name === 'd')?.[1] ?? '';
          if (deletedCoords.has(`30023:${user.pubkey}:${dTag}`)) return false;
          return true;
        })
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

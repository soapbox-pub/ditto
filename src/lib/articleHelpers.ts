import type { NostrEvent } from '@nostrify/nostrify';

/**
 * Addressable kinds that render with the long-form article preview layout:
 * kind 30023 (published, NIP-23) and kind 30024 (draft).
 */
export const ARTICLE_KINDS = new Set([30023, 30024]);

/** Fields shared by drafts and published articles. */
export interface ArticleFields {
  title: string;
  summary: string;
  content: string;
  image: string;
  tags: string[];
  slug: string;
}

/**
 * Extract common article fields from a Nostr event's tags + content.
 * Works for kind 30023 (published) events and the inner event of NIP-37 draft wraps.
 */
export function parseArticleEvent(event: NostrEvent): ArticleFields & { publishedAt: number } {
  const getTag = (name: string) => event.tags.find(t => t[0] === name)?.[1] || '';
  const getTags = (name: string) => event.tags.filter(t => t[0] === name).map(t => t[1]);

  const publishedAtTag = getTag('published_at');
  const publishedAt = publishedAtTag ? parseInt(publishedAtTag) * 1000 : event.created_at * 1000;

  return {
    title: getTag('title'),
    summary: getTag('summary'),
    content: event.content,
    image: getTag('image'),
    tags: getTags('t'),
    slug: getTag('d'),
    publishedAt,
  };
}

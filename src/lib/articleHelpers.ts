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

/** Average adult silent reading speed, in words per minute. */
const WORDS_PER_MINUTE = 225;

/**
 * Estimate how many minutes it takes to read the given article content.
 * Strips common Markdown syntax before counting words so formatting
 * characters don't inflate the count. Always returns at least 1 minute
 * for non-empty content, or 0 when there are no words.
 */
export function getReadingTimeMinutes(content: string): number {
  const text = content
    // Remove fenced code blocks.
    .replace(/```[\s\S]*?```/g, ' ')
    // Remove inline code.
    .replace(/`[^`]*`/g, ' ')
    // Drop image/link URLs but keep their visible label text.
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    // Strip remaining Markdown punctuation.
    .replace(/[#*_>~`-]/g, ' ');

  const words = text.split(/\s+/).filter(Boolean).length;
  if (words === 0) return 0;
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

/** Format a reading-time estimate as a short human label, e.g. "5 min read". */
export function formatReadingTime(content: string): string | undefined {
  const minutes = getReadingTimeMinutes(content);
  if (minutes === 0) return undefined;
  return `${minutes} min read`;
}

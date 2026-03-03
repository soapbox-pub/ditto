import type { NostrEvent } from '@nostrify/nostrify';

/** Bookstr NIP-XX event kind constants. */
export const BOOKSTR_KINDS = {
  READ_BOOKS: 10073,
  CURRENTLY_READING: 10074,
  TO_BE_READ: 10075,
  BOOK_REVIEW: 31985,
  READING_GOAL: 30078,
} as const;

/** Parsed book review data. */
export interface BookReview {
  isbn: string;
  content: string;
  /** 0-1 fraction, where 1.0 = 5/5 stars. */
  rating?: number;
  contentWarning?: string;
}

/** Check if a Nostr event is book-related. */
export function isBookEvent(event: NostrEvent): boolean {
  // Check for bookstr hashtag
  if (event.tags.some(([name, value]) => name === 't' && value === 'bookstr')) {
    return true;
  }

  // Check for ISBN references
  if (event.tags.some(([name, value]) => name === 'i' && value?.startsWith('isbn:'))) {
    return true;
  }

  // Check for book-specific kinds
  return (Object.values(BOOKSTR_KINDS) as number[]).includes(event.kind);
}

/** Extract an ISBN from a book event, or null if none found. */
export function extractISBNFromEvent(event: NostrEvent): string | null {
  // For reviews (kind 31985), check the d tag
  if (event.kind === BOOKSTR_KINDS.BOOK_REVIEW) {
    const dTag = event.tags.find(([name]) => name === 'd')?.[1];
    if (dTag?.startsWith('isbn:')) {
      return dTag.replace('isbn:', '');
    }
  }

  // For other events, check i tags
  const iTag = event.tags.find(
    ([name, value]) => name === 'i' && value?.startsWith('isbn:'),
  )?.[1];
  return iTag ? iTag.replace('isbn:', '') : null;
}

/** Parse a kind 31985 event into a BookReview, or null if invalid. */
export function parseBookReview(event: NostrEvent): BookReview | null {
  if (event.kind !== BOOKSTR_KINDS.BOOK_REVIEW) return null;

  const dTag = event.tags.find(([name]) => name === 'd')?.[1];
  if (!dTag?.startsWith('isbn:')) return null;

  const isbn = dTag.replace('isbn:', '');
  const ratingTag = event.tags.find(([name]) => name === 'rating')?.[1];
  const contentWarningTag = event.tags.find(([name]) => name === 'content-warning')?.[1];

  let rating: number | undefined;
  if (ratingTag) {
    const parsed = parseFloat(ratingTag);
    if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) {
      rating = parsed;
    }
  }

  return {
    isbn,
    content: event.content,
    rating,
    contentWarning: contentWarningTag,
  };
}

/** Validate that a kind 31985 event has the required tags. */
export function validateBookReview(event: NostrEvent): boolean {
  if (event.kind !== BOOKSTR_KINDS.BOOK_REVIEW) return false;

  const dTag = event.tags.find(([name]) => name === 'd')?.[1];
  if (!dTag?.startsWith('isbn:')) return false;

  const kTag = event.tags.find(([name]) => name === 'k')?.[1];
  if (kTag !== 'isbn') return false;

  // If rating tag exists, validate range
  const ratingTag = event.tags.find(([name]) => name === 'rating')?.[1];
  if (ratingTag) {
    const parsed = parseFloat(ratingTag);
    if (isNaN(parsed) || parsed < 0 || parsed > 1) return false;
  }

  return true;
}

/** Convert a 0-1 rating fraction to a 0-5 star count (rounded to nearest integer). */
export function ratingToStars(fraction: number): number {
  return Math.round(fraction * 5);
}

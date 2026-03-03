import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import type { NostrEvent } from '@nostrify/nostrify';
import {
  BOOKSTR_KINDS,
  validateBookReview,
  parseBookReview,
  type BookReview,
} from '@/lib/bookstr';

/** Fetch all reviews for a book by ISBN. */
export function useBookReviews(isbn: string) {
  const { nostr } = useNostr();

  return useQuery({
    queryKey: ['book-reviews', isbn],
    queryFn: async ({ signal }) => {
      const events = await nostr.query([{
        kinds: [BOOKSTR_KINDS.BOOK_REVIEW],
        '#d': [`isbn:${isbn}`],
        limit: 100,
      }], { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) });

      // Filter and parse valid reviews
      const reviews: Array<{ event: NostrEvent; review: BookReview }> = [];
      for (const event of events) {
        if (!validateBookReview(event)) continue;
        const review = parseBookReview(event);
        if (review) {
          reviews.push({ event, review });
        }
      }

      return reviews.sort((a, b) => b.event.created_at - a.event.created_at);
    },
    enabled: !!isbn,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}

/** Fetch the current user's review for a specific book. */
export function useUserBookReview(isbn: string) {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();

  return useQuery({
    queryKey: ['user-book-review', isbn, user?.pubkey],
    queryFn: async ({ signal }) => {
      if (!user) return null;

      const events = await nostr.query([{
        kinds: [BOOKSTR_KINDS.BOOK_REVIEW],
        authors: [user.pubkey],
        '#d': [`isbn:${isbn}`],
        limit: 1,
      }], { signal: AbortSignal.any([signal, AbortSignal.timeout(3000)]) });

      const validEvents = events.filter(validateBookReview);
      if (validEvents.length === 0) return null;

      const review = parseBookReview(validEvents[0]);
      return review ? { event: validEvents[0], review } : null;
    },
    enabled: !!user && !!isbn,
  });
}

/** Publish or update a book review. */
export function usePublishReview() {
  const queryClient = useQueryClient();
  const { user } = useCurrentUser();
  const { mutateAsync: publishEvent } = useNostrPublish();

  return useMutation({
    mutationFn: async (review: BookReview) => {
      if (!user) throw new Error('User not logged in');

      const tags: string[][] = [
        ['d', `isbn:${review.isbn}`],
        ['k', 'isbn'],
      ];

      if (review.rating !== undefined) {
        tags.push(['rating', review.rating.toString()]);
      }

      if (review.contentWarning) {
        tags.push(['content-warning', review.contentWarning]);
      }

      return publishEvent({
        kind: BOOKSTR_KINDS.BOOK_REVIEW,
        content: review.content,
        tags,
      });
    },
    onSuccess: (_, review) => {
      queryClient.invalidateQueries({ queryKey: ['book-reviews', review.isbn] });
      queryClient.invalidateQueries({ queryKey: ['user-book-review', review.isbn, user?.pubkey] });
      queryClient.invalidateQueries({ queryKey: ['book-feed'] });
    },
  });
}

/** Compute the average rating for a set of reviews. */
export function useBookRating(isbn: string) {
  const { data: reviews } = useBookReviews(isbn);

  const ratings = reviews
    ?.map(({ review }) => review.rating)
    .filter((rating): rating is number => rating !== undefined) ?? [];

  if (ratings.length === 0) {
    return { averageRating: null, totalRatings: 0 };
  }

  const sum = ratings.reduce((acc, r) => acc + r, 0);
  return {
    averageRating: sum / ratings.length,
    totalRatings: ratings.length,
  };
}

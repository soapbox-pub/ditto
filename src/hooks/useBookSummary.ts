import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import type { NostrEvent } from '@nostrify/nostrify';
import { extractISBNFromEvent } from '@/lib/bookstr';

/** Lightweight book metadata for feed display (single API call). */
export interface BookSummary {
  title: string;
  author: string;
  isbn: string;
  coverUrl: string;
  pubDate?: string;
}

/** Cache durations — book metadata rarely changes. */
const STALE_TIME = 1000 * 60 * 60 * 24; // 24 hours
const GC_TIME = 1000 * 60 * 60 * 48; // 48 hours

/**
 * Fetch only the edition data from OpenLibrary (1 request instead of 3).
 * Extracts title, first author name, cover, and publish date — everything
 * the feed's InlineBookCard needs.
 */
async function fetchBookSummary(isbn: string, signal?: AbortSignal): Promise<BookSummary | null> {
  try {
    const cleanISBN = isbn.replace(/[^0-9X]/gi, '');

    const res = await fetch(
      `https://openlibrary.org/isbn/${cleanISBN}.json`,
      { signal, headers: { Accept: 'application/json' } },
    );
    if (!res.ok) return null;

    const edition = await res.json();

    // Resolve author name inline if available, otherwise fall back
    let author = 'Unknown Author';
    if (edition.authors && Array.isArray(edition.authors)) {
      const first = edition.authors[0];
      if (first?.name) {
        author = first.name;
      } else if (first?.key) {
        // Try to resolve author name — but don't block on failure
        try {
          const authorRes = await fetch(`https://openlibrary.org${first.key}.json`, { signal });
          if (authorRes.ok) {
            const authorData = await authorRes.json();
            author = authorData.name ?? 'Unknown Author';
          }
        } catch { /* ignore */ }
      }
    }

    // Build cover URL from cover ID or ISBN directly
    const isbn13 = edition.isbn_13?.[0];
    const isbn10 = edition.isbn_10?.[0];
    const coverId = edition.covers?.[0];

    let coverUrl = '';
    if (coverId) {
      coverUrl = `https://covers.openlibrary.org/b/id/${coverId}-M.jpg`;
    } else if (isbn13) {
      coverUrl = `https://covers.openlibrary.org/b/isbn/${isbn13}-M.jpg`;
    } else if (isbn10) {
      coverUrl = `https://covers.openlibrary.org/b/isbn/${isbn10}-M.jpg`;
    }

    return {
      title: edition.title ?? 'Unknown Title',
      author,
      isbn: isbn13 ?? isbn10 ?? isbn,
      coverUrl,
      pubDate: edition.publish_date,
    };
  } catch {
    return null;
  }
}

/** Hook to fetch lightweight book summary for feed display. */
export function useBookSummary(isbn: string | null) {
  return useQuery({
    queryKey: ['book-summary', isbn],
    queryFn: ({ signal }) => fetchBookSummary(isbn!, signal),
    enabled: !!isbn,
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
    retry: 1,
  });
}

/**
 * Batch-prefetch book summaries for a list of Nostr events.
 *
 * Extracts unique ISBNs from the events, skips any already cached,
 * and fetches up to `concurrency` at a time to avoid hammering OpenLibrary.
 */
export function usePrefetchBookSummaries(events: NostrEvent[], concurrency = 4) {
  const queryClient = useQueryClient();
  const prefetchedRef = useRef(new Set<string>());

  useEffect(() => {
    if (events.length === 0) return;

    // Extract unique ISBNs not yet prefetched or cached
    const isbns = new Set<string>();
    for (const event of events) {
      const isbn = extractISBNFromEvent(event);
      if (!isbn) continue;
      if (prefetchedRef.current.has(isbn)) continue;

      const cached = queryClient.getQueryData(['book-summary', isbn]);
      if (cached !== undefined) continue;

      isbns.add(isbn);
    }

    if (isbns.size === 0) return;

    // Mark as prefetched immediately to avoid duplicate requests
    for (const isbn of isbns) {
      prefetchedRef.current.add(isbn);
    }

    // Fetch in batches of `concurrency`
    const isbnArray = Array.from(isbns);

    async function prefetchBatch(batch: string[]) {
      await Promise.allSettled(
        batch.map((isbn) =>
          queryClient.prefetchQuery({
            queryKey: ['book-summary', isbn],
            queryFn: ({ signal }) => fetchBookSummary(isbn, signal),
            staleTime: STALE_TIME,
            gcTime: GC_TIME,
          }),
        ),
      );
    }

    (async () => {
      for (let i = 0; i < isbnArray.length; i += concurrency) {
        const batch = isbnArray.slice(i, i + concurrency);
        await prefetchBatch(batch);
      }
    })();
  }, [events, queryClient, concurrency]);
}

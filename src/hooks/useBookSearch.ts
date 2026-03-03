import { useQuery } from '@tanstack/react-query';

/** A book search result from OpenLibrary. */
export interface BookSearchResult {
  title: string;
  authors: string[];
  isbn: string;
  coverUrl?: string;
  firstPublishYear?: number;
}

interface SearchDoc {
  title: string;
  author_name?: string[];
  cover_i?: number;
  first_publish_year?: number;
  isbn?: string[];
}

interface SearchResponse {
  docs: SearchDoc[];
}

/** Pick the best ISBN from the list, preferring ISBN-13. */
function pickIsbn(isbns: string[]): string | undefined {
  return isbns.find((i) => i.length === 13) ?? isbns[0];
}

async function searchBooks(query: string, signal?: AbortSignal): Promise<BookSearchResult[]> {
  const params = new URLSearchParams({
    q: query,
    limit: '8',
    fields: 'title,author_name,cover_i,first_publish_year,isbn',
  });

  const response = await fetch(
    `https://openlibrary.org/search.json?${params}`,
    { signal, headers: { Accept: 'application/json' } },
  );
  if (!response.ok) return [];

  const data: SearchResponse = await response.json();

  const results: BookSearchResult[] = [];

  for (const doc of data.docs) {
    const isbn = doc.isbn ? pickIsbn(doc.isbn) : undefined;
    if (!isbn) continue;

    results.push({
      title: doc.title,
      authors: doc.author_name ?? [],
      isbn,
      coverUrl: doc.cover_i
        ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-S.jpg`
        : undefined,
      firstPublishYear: doc.first_publish_year,
    });
  }

  return results;
}

/** Hook to search books on OpenLibrary by title, author, etc. */
export function useBookSearch(query: string) {
  return useQuery({
    queryKey: ['book-search', query],
    queryFn: ({ signal }) => searchBooks(query, signal),
    enabled: query.trim().length >= 2,
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 30, // 30 minutes
    retry: 1,
    placeholderData: (prev) => prev,
  });
}

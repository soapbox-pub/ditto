import { useQuery } from '@tanstack/react-query';

export interface PopularBook {
  /** Book title. */
  title: string;
  /** Author name(s). */
  authors: string[];
  /** ISBN-13 (preferred) or ISBN-10 for the best available edition. */
  isbn: string;
  /** Cover image URL (medium size). */
  coverUrl?: string;
  /** First publish year. */
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

async function fetchPopularBooks(signal?: AbortSignal): Promise<PopularBook[]> {
  const params = new URLSearchParams({
    q: 'language:eng',
    sort: 'readinglog',
    limit: '20',
    fields: 'title,author_name,cover_i,first_publish_year,isbn',
  });

  const response = await fetch(
    `https://openlibrary.org/search.json?${params}`,
    { signal, headers: { Accept: 'application/json' } },
  );
  if (!response.ok) return [];

  const data: SearchResponse = await response.json();

  const books: PopularBook[] = [];

  for (const doc of data.docs) {
    const isbn = doc.isbn ? pickIsbn(doc.isbn) : undefined;
    if (!isbn) continue;

    const coverUrl = doc.cover_i
      ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`
      : undefined;

    books.push({
      title: doc.title,
      authors: doc.author_name ?? [],
      isbn,
      coverUrl,
      firstPublishYear: doc.first_publish_year,
    });
  }

  return books;
}

/** Hook to fetch popular books from OpenLibrary sorted by reading log count. */
export function usePopularBooks() {
  return useQuery({
    queryKey: ['popular-books'],
    queryFn: ({ signal }) => fetchPopularBooks(signal),
    staleTime: 1000 * 60 * 60 * 6, // 6 hours
    gcTime: 1000 * 60 * 60 * 24, // 24 hours
    retry: 1,
  });
}

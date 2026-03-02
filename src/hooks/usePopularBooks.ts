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

interface TrendingEditionDoc {
  availability?: {
    isbn?: string;
  };
}

interface TrendingWork {
  title: string;
  author_name?: string[];
  cover_i?: number;
  first_publish_year?: number;
  editions?: {
    docs?: TrendingEditionDoc[];
  };
}

interface TrendingResponse {
  works: TrendingWork[];
}

async function fetchPopularBooks(signal?: AbortSignal): Promise<PopularBook[]> {
  const response = await fetch(
    'https://openlibrary.org/trending/hourly.json?limit=20',
    { signal, headers: { Accept: 'application/json' } },
  );
  if (!response.ok) return [];

  const data: TrendingResponse = await response.json();

  const books: PopularBook[] = [];

  for (const work of data.works) {
    // Extract ISBN from the first edition's availability
    const isbn = work.editions?.docs?.[0]?.availability?.isbn;
    if (!isbn) continue;

    const coverUrl = work.cover_i
      ? `https://covers.openlibrary.org/b/id/${work.cover_i}-M.jpg`
      : undefined;

    books.push({
      title: work.title,
      authors: work.author_name ?? [],
      isbn,
      coverUrl,
      firstPublishYear: work.first_publish_year,
    });
  }

  return books;
}

/** Hook to fetch popular/trending books from OpenLibrary. */
export function usePopularBooks() {
  return useQuery({
    queryKey: ['popular-books'],
    queryFn: ({ signal }) => fetchPopularBooks(signal),
    staleTime: 1000 * 60 * 30, // 30 minutes
    gcTime: 1000 * 60 * 60 * 2, // 2 hours
    retry: 1,
  });
}

import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';

const _OpenLibraryBookSchema = z.object({
  title: z.string(),
  authors: z.array(z.object({
    name: z.string(),
  })).optional(),
  number_of_pages: z.number().optional(),
  publish_date: z.string().optional(),
  publishers: z.array(z.object({
    name: z.string(),
  })).optional(),
  subjects: z.array(z.object({
    name: z.string(),
  })).optional(),
  cover: z.object({
    small: z.string().optional(),
    medium: z.string().optional(),
    large: z.string().optional(),
  }).optional(),
  excerpts: z.array(z.object({
    text: z.string(),
  })).optional(),
});

export type BookInfo = z.infer<typeof _OpenLibraryBookSchema>;

async function fetchBookInfo(isbn: string, signal?: AbortSignal): Promise<BookInfo | null> {
  try {
    const response = await fetch(
      `https://openlibrary.org/isbn/${isbn}.json`,
      { signal, headers: { Accept: 'application/json' } },
    );
    if (!response.ok) return null;

    const raw = await response.json();

    // OpenLibrary sometimes returns author keys instead of embedded objects.
    // Fetch author names if needed.
    let authors: { name: string }[] | undefined;
    if (raw.authors && Array.isArray(raw.authors)) {
      const authorEntries = raw.authors as Array<{ key?: string; name?: string }>;
      const hasKeys = authorEntries.some((a) => a.key && !a.name);
      if (hasKeys) {
        const authorNames = await Promise.all(
          authorEntries.map(async (a) => {
            if (a.name) return { name: a.name };
            if (a.key) {
              try {
                const res = await fetch(`https://openlibrary.org${a.key}.json`, { signal });
                if (res.ok) {
                  const data = await res.json();
                  return { name: data.name ?? 'Unknown Author' };
                }
              } catch { /* ignore */ }
            }
            return { name: 'Unknown Author' };
          }),
        );
        authors = authorNames;
      }
    }

    // Build cover URLs from cover ID if present
    let cover: BookInfo['cover'];
    if (raw.covers && Array.isArray(raw.covers) && raw.covers.length > 0) {
      const coverId = raw.covers[0];
      cover = {
        small: `https://covers.openlibrary.org/b/id/${coverId}-S.jpg`,
        medium: `https://covers.openlibrary.org/b/id/${coverId}-M.jpg`,
        large: `https://covers.openlibrary.org/b/id/${coverId}-L.jpg`,
      };
    }

    return {
      title: raw.title ?? 'Unknown Title',
      authors: authors ?? raw.authors,
      number_of_pages: raw.number_of_pages,
      publish_date: raw.publish_date,
      publishers: raw.publishers,
      subjects: raw.subjects?.slice(0, 5),
      cover: cover ?? raw.cover,
      excerpts: raw.excerpts,
    };
  } catch {
    return null;
  }
}

/** Hook to fetch book information from OpenLibrary by ISBN. */
export function useBookInfo(isbn: string | null) {
  return useQuery({
    queryKey: ['book-info', isbn],
    queryFn: ({ signal }) => fetchBookInfo(isbn!, signal),
    enabled: !!isbn,
    staleTime: 1000 * 60 * 60 * 24, // 24 hours
    gcTime: 1000 * 60 * 60 * 24 * 7, // 7 days
    retry: 1,
  });
}

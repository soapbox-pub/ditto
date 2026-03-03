import { useQuery } from '@tanstack/react-query';

/** Book metadata from OpenLibrary. */
export interface BookDetails {
  title: string;
  author: string;
  isbn: string;
  coverUrl: string;
  pubDate?: string;
  pageCount?: number;
  description?: string;
  categories?: string[];
}

/** Fetch book details from OpenLibrary by ISBN. */
async function fetchBookDetails(isbn: string, signal?: AbortSignal): Promise<BookDetails | null> {
  try {
    const cleanISBN = isbn.replace(/[^0-9X]/gi, '');

    const editionRes = await fetch(
      `https://openlibrary.org/isbn/${cleanISBN}.json`,
      { signal, headers: { Accept: 'application/json' } },
    );
    if (!editionRes.ok) return null;

    const edition = await editionRes.json();

    // Resolve author name from author key
    let author = 'Unknown Author';
    if (edition.authors && Array.isArray(edition.authors)) {
      const firstAuthor = edition.authors[0];
      if (firstAuthor?.key) {
        try {
          const authorRes = await fetch(
            `https://openlibrary.org${firstAuthor.key}.json`,
            { signal },
          );
          if (authorRes.ok) {
            const authorData = await authorRes.json();
            author = authorData.name ?? 'Unknown Author';
          }
        } catch { /* ignore */ }
      } else if (firstAuthor?.name) {
        author = firstAuthor.name;
      }
    }

    // Get work-level data (description, subjects) if available
    let description: string | undefined;
    let categories: string[] | undefined;
    let workCovers: number[] | undefined;

    if (edition.works?.[0]?.key) {
      try {
        const workRes = await fetch(
          `https://openlibrary.org${edition.works[0].key}.json`,
          { signal },
        );
        if (workRes.ok) {
          const work = await workRes.json();
          if (typeof work.description === 'string') {
            description = work.description;
          } else if (work.description?.value) {
            description = work.description.value;
          }
          if (work.subjects) {
            categories = work.subjects.slice(0, 5);
          }
          workCovers = work.covers;
        }
      } catch { /* ignore */ }
    }

    // Build cover URL
    const isbn13 = edition.isbn_13?.[0];
    const isbn10 = edition.isbn_10?.[0];
    const coverId = edition.covers?.[0] ?? workCovers?.[0];

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
      pageCount: edition.number_of_pages,
      description,
      categories,
    };
  } catch {
    return null;
  }
}

/** Hook to fetch book details from OpenLibrary by ISBN. */
export function useBookDetails(isbn: string | null) {
  return useQuery({
    queryKey: ['book-details', isbn],
    queryFn: ({ signal }) => fetchBookDetails(isbn!, signal),
    enabled: !!isbn,
    staleTime: 1000 * 60 * 60 * 24, // 24 hours
    gcTime: 1000 * 60 * 60 * 48, // 48 hours
    retry: 1,
  });
}

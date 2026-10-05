/**
 * A reviewed book, as Open Library knows it.
 *
 * A Bookstr review (kind 31985) names its book only by ISBN. Open Library
 * gives its title, its author and its cover, the way the app's own book
 * pages show them.
 */

export interface Book {
  title: string;
  author?: string;
  cover?: string;
}

/** What Open Library says of an ISBN, or undefined where it says nothing. */
export async function book(isbn: string, signal: AbortSignal): Promise<Book | undefined> {
  try {
    const edition = await json(`https://openlibrary.org/isbn/${encodeURIComponent(isbn.replace(/-/g, ''))}.json`, signal);
    const title = string(field(edition, 'title'));
    if (!title) return undefined;
    const covers = field(edition, 'covers');
    const cover = Array.isArray(covers) && Number.isInteger(covers[0]) && covers[0] > 0 ? `https://covers.openlibrary.org/b/id/${covers[0]}-L.jpg` : undefined;
    // Its first author, by the key it names them by.
    const authors = field(edition, 'authors');
    const key = Array.isArray(authors) ? string(field(authors[0], 'key')) : undefined;
    const author = key && /^\/authors\/OL\d+A$/.test(key) ? string(field(await json(`https://openlibrary.org${key}.json`, signal).catch(() => undefined), 'name')) : undefined;
    return { title, author, cover };
  } catch {
    return undefined;
  }
}

async function json(url: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Open Library answered ${response.status}`);
  return response.json();
}

function field(value: unknown, key: string): unknown {
  return value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined;
}

function string(value: unknown): string | undefined {
  return typeof value === 'string' ? value.trim() || undefined : undefined;
}

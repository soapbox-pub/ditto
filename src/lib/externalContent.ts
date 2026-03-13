import { embedLabel } from '@/lib/linkEmbed';
import { getCountryInfo } from '@/lib/countries';

// ---------------------------------------------------------------------------
// Types & helpers
// ---------------------------------------------------------------------------

/** Parsed external content identifier with its type. */
export type ExternalContent =
  | { type: 'url'; value: string }
  | { type: 'isbn'; value: string }
  | { type: 'iso3166'; value: string; code: string }
  | { type: 'unknown'; value: string };

/** Parse a URI string into a typed external content object. */
export function parseExternalUri(uri: string): ExternalContent {
  if (uri.startsWith('isbn:')) {
    return { type: 'isbn', value: uri };
  }
  if (uri.startsWith('iso3166:')) {
    const code = uri.slice('iso3166:'.length);
    return { type: 'iso3166', value: uri, code };
  }
  if (uri.startsWith('http://') || uri.startsWith('https://')) {
    return { type: 'url', value: uri };
  }
  return { type: 'unknown', value: uri };
}

/** Format an ISBN with hyphens for display (simplified). */
export function formatIsbn(isbn: string): string {
  const digits = isbn.replace(/\D/g, '');
  if (digits.length === 13) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 4)}-${digits.slice(4, 9)}-${digits.slice(9, 12)}-${digits.slice(12)}`;
  }
  if (digits.length === 10) {
    return `${digits.slice(0, 1)}-${digits.slice(1, 5)}-${digits.slice(5, 9)}-${digits.slice(9)}`;
  }
  return isbn;
}

/** Get a short label for the content type. */
export function headerLabel(content: ExternalContent): string {
  switch (content.type) {
    case 'url': {
      const label = embedLabel(content.value);
      if (label) return label;
      try {
        return new URL(content.value).hostname.replace(/^www\./, '');
      } catch {
        return 'Web Page';
      }
    }
    case 'isbn':
      return 'Books';
    case 'iso3166': {
      const info = getCountryInfo(content.code);
      return info?.subdivisionName ?? info?.name ?? 'Country';
    }
    default:
      return 'External Content';
  }
}

/** Get a page title for SEO. */
export function seoTitle(content: ExternalContent, appName: string): string {
  switch (content.type) {
    case 'url':
      try {
        return `${new URL(content.value).hostname.replace(/^www\./, '')} | ${appName}`;
      } catch {
        return `Web Page | ${appName}`;
      }
    case 'isbn': {
      const isbn = content.value.replace('isbn:', '');
      return `Book (ISBN ${isbn}) | ${appName}`;
    }
    case 'iso3166': {
      const seoInfo = getCountryInfo(content.code);
      const seoName = seoInfo?.subdivisionName ?? seoInfo?.name;
      return seoName ? `${seoName} | ${appName}` : `Country | ${appName}`;
    }
    default:
      return `External Content | ${appName}`;
  }
}

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
  | { type: 'bitcoin-tx'; value: string; txid: string }
  | { type: 'bitcoin-address'; value: string; address: string }
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
  // NIP-73 Bitcoin transaction: bitcoin:tx:<txid>
  const btcTxMatch = uri.match(/^bitcoin:tx:([0-9a-f]{64})$/i);
  if (btcTxMatch) {
    return { type: 'bitcoin-tx', value: uri, txid: btcTxMatch[1].toLowerCase() };
  }
  // NIP-73 Bitcoin address: bitcoin:address:<address>
  const btcAddrMatch = uri.match(/^bitcoin:address:(.+)$/);
  if (btcAddrMatch) {
    return { type: 'bitcoin-address', value: uri, address: btcAddrMatch[1] };
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

/**
 * Try to extract a human-readable title from the last meaningful segment of a
 * URL path.  Returns `null` when the slug looks like an opaque ID rather than
 * a readable name (e.g. YouTube video IDs, hex hashes, etc.).
 */
function slugTitle(url: string): string | null {
  try {
    const { pathname } = new URL(url);
    // Walk segments from right to left and pick the first "readable" one
    const segments = pathname.split('/').filter(Boolean);
    for (let i = segments.length - 1; i >= 0; i--) {
      const seg = decodeURIComponent(segments[i]);
      // Skip very short segments or ones that look like opaque IDs
      if (seg.length < 4) continue;
      if (/^[A-Za-z0-9_-]{6,14}$/.test(seg) && !/[- ]/.test(seg)) continue; // likely an ID
      // Must contain at least one separator (hyphen or underscore) to look like a slug
      if (!/[-_]/.test(seg)) continue;
      return seg
        .replace(/[-_]+/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase())
        .trim();
    }
  } catch {
    // invalid URL
  }
  return null;
}

/** Get a short label for the content type. */
export function headerLabel(content: ExternalContent): string {
  switch (content.type) {
    case 'url': {
      // Prefer a human-readable slug from the URL path
      const slug = slugTitle(content.value);
      if (slug) return slug;
      // Fall back to known embed site name, then hostname
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
    case 'bitcoin-tx':
      return 'Bitcoin Transaction';
    case 'bitcoin-address':
      return 'Bitcoin Address';
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
    case 'bitcoin-tx': {
      const shortTxid = `${content.txid.slice(0, 8)}...${content.txid.slice(-8)}`;
      return `Bitcoin TX ${shortTxid} | ${appName}`;
    }
    case 'bitcoin-address': {
      const shortAddr = `${content.address.slice(0, 8)}...${content.address.slice(-6)}`;
      return `Bitcoin Address ${shortAddr} | ${appName}`;
    }
    default:
      return `External Content | ${appName}`;
  }
}

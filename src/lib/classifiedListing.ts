import type { NostrEvent } from '@nostrify/nostrify';

import { sanitizeUrl } from '@/lib/sanitizeUrl';

/**
 * Addressable kind for NIP-99 classified listings (kind 30402).
 *
 * A listing describes any arbitrary product, service, or offer for sale. It
 * carries a `title`, an optional `summary`/`price`/`location`/`status`, one or
 * more NIP-58 `image` tags, and Markdown `content`. Its structure mirrors
 * NIP-23 long-form content but is meant for commerce rather than prose.
 *
 * Kind 30403 (draft / inactive listing) has the same shape but is not shown in
 * public feeds — it is the author's private draft.
 */
export const CLASSIFIED_LISTING_KIND = 30402;

/** Kinds that render with the classified-listing layout: 30402 (published). */
export const CLASSIFIED_LISTING_KINDS = new Set([CLASSIFIED_LISTING_KIND]);

/** A listing's price, parsed from the NIP-99 `price` tag. */
export interface ListingPrice {
  /** Numeric amount as it appeared in the tag. */
  amount: number;
  /** Currency code (ISO 4217 or ISO 4217-like, e.g. `USD`, `BTC`). */
  currency: string;
  /** Recurrence noun for subscriptions (`month`, `year`, …), if any. */
  frequency?: string;
}

/** Listing status per NIP-99 — "active" (for sale) or "sold". */
export type ListingStatus = 'active' | 'sold';

/** A fully-parsed classified listing with everything the UI needs. */
export interface ParsedClassifiedListing {
  /** The original event. */
  event: NostrEvent;
  /** Author's hex pubkey (the seller). */
  pubkey: string;
  /** The listing's `d` tag (slug). */
  identifier: string;
  /** Listing title. */
  title: string;
  /** Short tagline / summary, if present. */
  summary?: string;
  /** Markdown description (the event content). */
  content: string;
  /** Image URLs (validated https://) from `image` tags, in declaration order. */
  images: string[];
  /** Parsed price, if a well-formed `price` tag is present. */
  price?: ListingPrice;
  /** Listing status. Defaults to "active" when absent or unrecognized. */
  status: ListingStatus;
  /** Free-form location string, if present. */
  location?: string;
  /** External source link (`r` tag), validated https://. */
  sourceUrl?: string;
  /** Category hashtags (`t` tags). */
  hashtags: string[];
  /** First-published timestamp (Unix seconds), falling back to created_at. */
  publishedAt: number;
  /** Created-at from the event. */
  createdAt: number;
}

/** Returns the first value of a tag, or `undefined`. */
function getTag(event: NostrEvent, name: string): string | undefined {
  return event.tags.find(([n]) => n === name)?.[1];
}

/**
 * Decode the handful of HTML entities that listing generators commonly leave
 * in tag values (`&amp;`, `&#39;`, …). Tags are plaintext — entities in them
 * are publisher bugs, but common enough to be worth fixing at the parse layer.
 */
export function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, code: string) => {
      const n = parseInt(code, 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : _;
    })
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

/** Collapse a string for redundancy comparison: strip Markdown punctuation and whitespace runs, lowercase. */
function normalizeForCompare(s: string): string {
  return decodeHtmlEntities(s)
    .replace(/[#*_>`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Strip a trailing ellipsis ("..." or "…") left by publisher-side truncation. */
function stripEllipsis(s: string): string {
  return s.replace(/(\.\.\.|…)\s*$/, '').trim();
}

/**
 * The listing description with metadata-redundant lines removed.
 *
 * Many listing generators duplicate the structured tags inside `content`:
 * a heading repeating the `title`, a paragraph repeating the `summary`,
 * `**Price:** 3.99 USD` / `**Category:** Art` key-value boilerplate, and a
 * `*Listed by X*` footer. The UI already renders all of that from tags, so
 * showing the raw content reads everything twice. This filters those lines
 * out and returns `''` when nothing meaningful remains — callers should hide
 * the description section entirely in that case.
 */
export function listingResidualContent(listing: ParsedClassifiedListing): string {
  const normTitle = normalizeForCompare(listing.title);
  const normSummary = listing.summary
    ? stripEllipsis(normalizeForCompare(listing.summary))
    : undefined;

  const kept: string[] = [];
  for (const rawLine of listing.content.split('\n')) {
    const line = rawLine.trim();
    if (!line) {
      kept.push(rawLine);
      continue;
    }
    const norm = normalizeForCompare(line);
    // Heading or paragraph that just repeats the title.
    if (norm === normTitle) continue;
    // Paragraph that repeats the summary (either side may be truncated).
    if (normSummary) {
      const bare = stripEllipsis(norm);
      if (bare.length > 0 && (bare.startsWith(normSummary) || normSummary.startsWith(bare))) continue;
    }
    // `**Price:** …` / `Category: …` metadata boilerplate.
    if (/^(?:[-*+]\s+)?(?:\*\*|__)?\s*(?:price|category|type|condition|status|location|shipping)\s*(?:\*\*|__)?\s*:/i.test(line)) continue;
    // `*Listed by X*` footer.
    if (/^[*_]{1,2}listed by .+[*_]{1,2}$/i.test(line)) continue;
    kept.push(rawLine);
  }

  const residual = kept.join('\n').trim();
  return normalizeForCompare(residual) ? residual : '';
}

/** Parse the NIP-99 `price` tag: `["price", "<number>", "<currency>", "<freq>?"]`. */
export function parseListingPrice(event: NostrEvent): ListingPrice | undefined {
  const tag = event.tags.find(([n]) => n === 'price');
  if (!tag) return undefined;

  const amount = Number(tag[1]);
  const currency = tag[2]?.trim();
  if (!Number.isFinite(amount) || amount < 0 || !currency) return undefined;

  const frequency = tag[3]?.trim();
  return {
    amount,
    currency: currency.toUpperCase(),
    frequency: frequency ? frequency : undefined,
  };
}

/**
 * Format a {@link ListingPrice} for display, e.g. `$3.99`, `€15/month`,
 * `0.001 BTC`. Uses `Intl.NumberFormat` currency formatting for valid ISO 4217
 * codes and falls back to `<amount> <CURRENCY>` for anything it rejects (e.g.
 * `BTC`, which is not a standard ISO 4217 code).
 */
export function formatListingPrice(price: ListingPrice): string {
  let base: string;
  try {
    base = new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: price.currency,
      // Allow whole-number prices to render without forced cents.
      minimumFractionDigits: Number.isInteger(price.amount) ? 0 : 2,
    }).format(price.amount);
  } catch {
    // Non-ISO-4217 codes (BTC, ETH, …) throw — fall back to a plain label.
    base = `${price.amount.toLocaleString()} ${price.currency}`;
  }
  return price.frequency ? `${base}/${price.frequency}` : base;
}

/**
 * Parse a kind 30402 event into a strongly-typed
 * {@link ParsedClassifiedListing}. Returns `null` when the event has no
 * `title` — the UI treats a title-less listing as unrenderable and drops it.
 */
export function parseClassifiedListing(event: NostrEvent): ParsedClassifiedListing | null {
  if (event.kind !== CLASSIFIED_LISTING_KIND) return null;

  const title = getTag(event, 'title')?.trim();
  if (!title) return null;

  const images: string[] = [];
  for (const [name, url] of event.tags) {
    if (name !== 'image') continue;
    const safe = sanitizeUrl(url);
    if (safe) images.push(safe);
  }

  const rawStatus = getTag(event, 'status')?.trim().toLowerCase();
  const status: ListingStatus = rawStatus === 'sold' ? 'sold' : 'active';

  const publishedAtRaw = getTag(event, 'published_at');
  const publishedAt = publishedAtRaw && /^\d+$/.test(publishedAtRaw)
    ? parseInt(publishedAtRaw, 10)
    : event.created_at;

  const hashtags = event.tags.filter(([n]) => n === 't').map(([, v]) => v).filter(Boolean);

  return {
    event,
    pubkey: event.pubkey,
    identifier: getTag(event, 'd') ?? '',
    title: decodeHtmlEntities(title),
    summary: (() => {
      const s = getTag(event, 'summary')?.trim();
      return s ? decodeHtmlEntities(s) : undefined;
    })(),
    content: event.content,
    images,
    price: parseListingPrice(event),
    status,
    location: (() => {
      const l = getTag(event, 'location')?.trim();
      return l ? decodeHtmlEntities(l) : undefined;
    })(),
    sourceUrl: sanitizeUrl(getTag(event, 'r')),
    hashtags,
    publishedAt,
    createdAt: event.created_at,
  };
}

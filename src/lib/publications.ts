/**
 * Helpers for PressStr-style digital publications on Nostr:
 * magazines, magazine issues, and ebooks (see NIP.md — "Publications").
 *
 * - Kind 34609 — Magazine (parent record grouping issues)
 * - Kind 39731 — Magazine Issue (a single issue of a magazine)
 * - Kind 33953 — Ebook (standalone PDF / EPUB)
 */

import type { NostrEvent } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { isNostrId } from '@/lib/nostrId';

export const MAGAZINE_KIND = 34609;
export const MAGAZINE_ISSUE_KIND = 39731;
export const EBOOK_KIND = 33953;

/** All publication kinds handled by the app. */
export const PUBLICATION_KINDS = new Set<number>([
  MAGAZINE_KIND,
  MAGAZINE_ISSUE_KIND,
  EBOOK_KIND,
]);

/** Publication kinds that carry a downloadable/viewable file (PDF or EPUB). */
export const PUBLICATION_FILE_KINDS = new Set<number>([
  MAGAZINE_ISSUE_KIND,
  EBOOK_KIND,
]);

function getTag(event: NostrEvent, name: string): string | undefined {
  return event.tags.find(([n]) => n === name)?.[1];
}

function getTags(event: NostrEvent, name: string): string[] {
  return event.tags.filter(([n]) => n === name).map(([, v]) => v).filter(Boolean);
}

export type PublicationFormat = 'PDF' | 'EPUB';

export interface Publication {
  kind: number;
  event: NostrEvent;
  /** `d` tag identifier. */
  identifier: string;
  title: string;
  /** Sanitized cover image URL, if valid https. */
  image?: string;
  /** Sanitized file URLs (mirrors), first entry is the primary. */
  fileUrls: string[];
  /** Primary sanitized file URL, if any. */
  fileUrl?: string;
  mimeType: string;
  format: PublicationFormat;
  /** File size in bytes, if provided. */
  size?: number;
  summary?: string;
  /** Freeform description / markdown body from event content. */
  content: string;
  /** Original publication timestamp (unix seconds), if provided. */
  publishedAt?: number;
  language?: string;
  /** `t` topic tags. */
  topics: string[];
  /** Author name strings (ebook `author` tags). */
  authors: string[];
  isbn?: string;
  /** Issue number/label (magazine issues only). */
  issue?: string;
  /**
   * Parent magazine addressable coordinate for issues:
   * `{ kind, pubkey, identifier }`, when the `a` tag references a magazine.
   */
  magazine?: { kind: number; pubkey: string; identifier: string };
}

/** Parse a publication event (magazine, issue, or ebook) into a normalized shape. */
export function parsePublication(event: NostrEvent): Publication {
  const mimeType = getTag(event, 'm') ?? 'application/pdf';
  const isEpub = mimeType.includes('epub');
  const format: PublicationFormat = isEpub ? 'EPUB' : 'PDF';

  const fileUrls: string[] = [];
  for (const url of getTags(event, 'url')) {
    const safe = sanitizeUrl(url);
    if (safe && !fileUrls.includes(safe)) fileUrls.push(safe);
  }

  const sizeRaw = getTag(event, 'size');
  const size = sizeRaw && /^\d+$/.test(sizeRaw) ? Number(sizeRaw) : undefined;

  const publishedRaw = getTag(event, 'published_at');
  const publishedAt = publishedRaw && /^\d+$/.test(publishedRaw)
    ? Number(publishedRaw)
    : undefined;

  return {
    kind: event.kind,
    event,
    identifier: getTag(event, 'd') ?? '',
    title: getTag(event, 'title') ?? 'Untitled',
    image: sanitizeUrl(getTag(event, 'image')),
    fileUrls,
    fileUrl: fileUrls[0],
    mimeType,
    format,
    size,
    summary: getTag(event, 'summary'),
    content: event.content,
    publishedAt,
    language: getTag(event, 'l'),
    topics: getTags(event, 't'),
    authors: getTags(event, 'author'),
    isbn: getTag(event, 'isbn'),
    issue: getTag(event, 'issue'),
    magazine: parseMagazineCoord(getTag(event, 'a')),
  };
}

/**
 * Parse a magazine `a`-tag coordinate (`34609:<pubkey>:<d>`) into its parts.
 * Returns `undefined` if malformed or the pubkey isn't valid hex.
 */
export function parseMagazineCoord(
  coord: string | undefined,
): { kind: number; pubkey: string; identifier: string } | undefined {
  if (!coord) return undefined;
  const parts = coord.split(':');
  if (parts.length < 3) return undefined;
  const kind = Number(parts[0]);
  const pubkey = parts[1];
  const identifier = parts.slice(2).join(':');
  if (kind !== MAGAZINE_KIND) return undefined;
  if (!isNostrId(pubkey)) return undefined;
  return { kind, pubkey, identifier };
}

/** Build the `#a` filter value for querying a magazine's issues. */
export function magazineIssuesFilterValue(pubkey: string, identifier: string): string {
  return `${MAGAZINE_KIND}:${pubkey}:${identifier}`;
}

/** Encode an addressable publication event as an `naddr`. */
export function publicationNaddr(event: NostrEvent): string {
  const identifier = getTag(event, 'd') ?? '';
  return nip19.naddrEncode({ kind: event.kind, pubkey: event.pubkey, identifier });
}

/** Human-readable file size (e.g. "1.6 MB"). */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  const rounded = value >= 100 || exponent === 0 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} ${units[exponent]}`;
}

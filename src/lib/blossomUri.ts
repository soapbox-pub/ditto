import { isNostrId } from '@/lib/nostrId';
import { sanitizeUrl } from '@/lib/sanitizeUrl';

/**
 * BUD-10 `blossom:` URI support.
 *
 * A `blossom:` URI is a magnet-link-style reference to a content-addressed
 * Blossom blob, carrying discovery hints for locating it across servers:
 *
 *   blossom:<sha256>.<ext>[?xs=server&as=pubkey&sz=bytes]
 *
 * - `<sha256>` — 64-char lowercase hex hash of the blob (required)
 * - `.<ext>`   — file extension, defaulting to `.bin` (required)
 * - `xs`       — server domain hint(s) where the blob may be found (repeatable)
 * - `as`       — hex pubkey(s) of uploader(s) whose kind 10063 list may help (repeatable)
 * - `sz`       — exact blob size in bytes
 *
 * See https://github.com/hzrd149/blossom/blob/master/buds/10.md
 */

/** A matched `blossom:` URI within text. The pattern is intentionally permissive
 *  on the query portion; {@link parseBlossomUri} does strict validation. */
export const BLOSSOM_URI_REGEX =
  /blossom:[a-f0-9]{64}\.[a-z0-9]+(?:\?[^\s]*)?/i;

/** Parsed representation of a BUD-10 `blossom:` URI. */
export interface BlossomUri {
  /** 64-char lowercase hex sha256 hash. */
  sha256: string;
  /** Lowercase file extension without the leading dot (e.g. `png`, `bin`). */
  ext: string;
  /** `<sha256>.<ext>` — the blob path used against a Blossom server root. */
  path: string;
  /** Server domain hints (`xs`), in order, normalized to origins we can fetch. */
  servers: string[];
  /** Uploader pubkey hints (`as`), in order — validated 64-char hex. */
  authors: string[];
  /** Expected blob size in bytes (`sz`), if provided and valid. */
  size?: number;
}

/**
 * Parse a `blossom:` URI string into structured data.
 *
 * Returns `undefined` for anything that isn't a well-formed BUD-10 URI:
 * missing/invalid sha256, missing extension, etc. Query parameters that fail
 * validation (bad pubkey, non-positive size) are silently dropped rather than
 * rejecting the whole URI.
 */
export function parseBlossomUri(raw: string): BlossomUri | undefined {
  if (!raw.toLowerCase().startsWith('blossom:')) return undefined;

  const withoutScheme = raw.slice('blossom:'.length);
  const queryStart = withoutScheme.indexOf('?');
  const identifier = queryStart === -1 ? withoutScheme : withoutScheme.slice(0, queryStart);
  const query = queryStart === -1 ? '' : withoutScheme.slice(queryStart + 1);

  const idMatch = /^([a-f0-9]{64})\.([a-z0-9]+)$/i.exec(identifier);
  if (!idMatch) return undefined;

  const sha256 = idMatch[1].toLowerCase();
  const ext = idMatch[2].toLowerCase();
  if (!isNostrId(sha256)) return undefined;

  const params = new URLSearchParams(query);

  const servers: string[] = [];
  for (const value of params.getAll('xs')) {
    const origin = normalizeServerHint(value);
    if (origin && !servers.includes(origin)) servers.push(origin);
  }

  const authors: string[] = [];
  for (const value of params.getAll('as')) {
    const pubkey = value.toLowerCase();
    if (isNostrId(pubkey) && !authors.includes(pubkey)) authors.push(pubkey);
  }

  let size: number | undefined;
  const szRaw = params.get('sz');
  if (szRaw && /^\d+$/.test(szRaw)) {
    const parsed = Number(szRaw);
    if (Number.isSafeInteger(parsed) && parsed > 0) size = parsed;
  }

  return { sha256, ext, path: `${sha256}.${ext}`, servers, authors, size };
}

/**
 * Normalize a BUD-10 `xs` server hint to an `https://` origin we can fetch from.
 *
 * The hint SHOULD be a bare domain; a scheme MAY be present. Per BUD-10, when no
 * scheme is given clients prefer `https://`. For security we only ever produce
 * `https:` origins — an `http://` hint is upgraded to `https://`, matching the
 * app-wide policy that untrusted event data must resolve to HTTPS.
 */
function normalizeServerHint(hint: string): string | undefined {
  if (!hint) return undefined;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(hint) ? hint : `https://${hint}`;
  try {
    const url = new URL(withScheme);
    url.protocol = 'https:';
    return url.origin;
  } catch {
    return undefined;
  }
}

/**
 * Build the ordered list of candidate `https://` blob URLs for a parsed
 * `blossom:` URI.
 *
 * Order follows BUD-10's resolution strategy: `xs` server hints first, then the
 * user's effective Blossom servers as a fallback. Every candidate is validated
 * with {@link sanitizeUrl}, so the result contains only well-formed HTTPS URLs
 * and is safe to place into `src`/`href`. Duplicates are removed.
 */
export function resolveBlossomUri(uri: BlossomUri, fallbackServers: string[]): string[] {
  const candidates: string[] = [];
  const seen = new Set<string>();

  const push = (base: string) => {
    let origin: string;
    try {
      const url = new URL(base);
      url.protocol = 'https:';
      origin = url.origin;
    } catch {
      return;
    }
    const full = sanitizeUrl(`${origin}/${uri.path}`);
    if (full && !seen.has(full)) {
      seen.add(full);
      candidates.push(full);
    }
  };

  for (const server of uri.servers) push(server);
  for (const server of fallbackServers) push(server);

  return candidates;
}

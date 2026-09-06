import { sanitizeUrl } from '@/lib/sanitizeUrl';

/** SHA-256 hash pattern (64 hex characters) used in Blossom content-addressed URLs. */
const BLOSSOM_PATH_REGEX = /^\/([a-f0-9]{64})\b/;

/**
 * Alternative URLs for a content-addressed Blossom blob.
 *
 * A URL whose path starts with `/<sha256>` names the same bytes on every
 * Blossom server, so when one host is down or slow the blob can be fetched from
 * another. Returns an empty list for URLs that aren't content-addressed, and
 * never includes the origin of `originalUrl`.
 */
export function blossomAlternatives(originalUrl: string, servers: readonly string[]): string[] {
  try {
    const parsed = new URL(originalUrl);
    if (!BLOSSOM_PATH_REGEX.test(parsed.pathname)) return [];

    const { origin } = parsed;
    const seen = new Set<string>([origin]);
    const out: string[] = [];
    for (const server of servers) {
      let serverOrigin: string;
      try {
        serverOrigin = new URL(server).origin;
      } catch {
        continue;
      }
      if (seen.has(serverOrigin)) continue;
      seen.add(serverOrigin);
      out.push(`${serverOrigin}${parsed.pathname}${parsed.search}`);
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * The ordered list of sources to try for one media reference — the ONE place
 * that order is decided, whether the walk is then driven by an `<img>`'s
 * `onError` (`useBlossomFallback`) or by a fetch loop (`fetchDecryptedFile`).
 *
 * The primary URL first, then the sender's own imeta `fallback` entries, then
 * the same content-addressed blob on every other Blossom server. Declared
 * fallbacks outrank derived mirrors because the sender knows where they
 * actually put the blob, while a mirror is only a guess that a copy exists
 * there (BUD-04 mirroring is best-effort).
 *
 * The declared ones are raw event data, so they are sanitized HERE rather than
 * at each call site — a `javascript:` fallback must not reach an `<img src>`
 * by any route.
 */
export function mediaCandidates(
  url: string,
  declaredFallbacks: readonly string[] | undefined,
  servers: readonly string[],
): string[] {
  const seen = new Set<string>([url]);
  const out = [url];
  for (const raw of declaredFallbacks ?? []) {
    const safe = sanitizeUrl(raw);
    if (!safe || seen.has(safe)) continue;
    seen.add(safe);
    out.push(safe);
  }
  for (const mirror of blossomAlternatives(url, servers)) {
    if (seen.has(mirror)) continue;
    seen.add(mirror);
    out.push(mirror);
  }
  return out;
}

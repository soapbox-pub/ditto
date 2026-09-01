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
export function blossomAlternatives(originalUrl: string, servers: string[]): string[] {
  try {
    const parsed = new URL(originalUrl);
    if (!BLOSSOM_PATH_REGEX.test(parsed.pathname)) return [];

    const { origin } = parsed;
    return servers
      .filter((server) => {
        try {
          return new URL(server).origin !== origin;
        } catch {
          return false;
        }
      })
      .map((server) => `${new URL(server).origin}${parsed.pathname}${parsed.search}`);
  } catch {
    return [];
  }
}

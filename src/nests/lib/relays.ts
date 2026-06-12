/**
 * Normalize a relay URL.
 *
 * Returns the normalized URL string, or `null` if the input is malformed.
 *
 * Normalization rules:
 *  - Must parse as a valid URL with `ws:` or `wss:` protocol
 *  - Hostname is lowercased
 *  - Trailing slash on a root path is stripped (so `wss://relay/` === `wss://relay`)
 *  - Default ports (80 for ws, 443 for wss) are dropped
 *  - Hash and search components are dropped
 */
export function normalizeRelayUrl(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  if (url.protocol !== "ws:" && url.protocol !== "wss:") return null;
  if (!url.hostname) return null;

  url.hostname = url.hostname.toLowerCase();
  url.hash = "";
  url.search = "";

  // Drop default ports
  if (
    (url.protocol === "wss:" && url.port === "443") ||
    (url.protocol === "ws:" && url.port === "80")
  ) {
    url.port = "";
  }

  let out = url.toString();
  // Strip the single trailing slash that `new URL` adds when the path is "/"
  if (out.endsWith("/") && url.pathname === "/") {
    out = out.slice(0, -1);
  }
  return out;
}

/** Loopback, private-range, and link-local hosts. */
const PRIVATE_HOST_RE =
  /^(localhost|127\.\d{1,3}\.\d{1,3}\.\d{1,3}|0\.0\.0\.0|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|169\.254\.\d{1,3}\.\d{1,3}|::1|f[cde][0-9a-f]{2}:.*)$/i;

/**
 * Normalize relay URLs that come from untrusted sources (room event `relays`
 * tags, naddr hints). In addition to normal validation, this rejects
 * loopback/private/link-local hosts so a malicious event can't direct the
 * client to probe services on the user's machine or LAN.
 *
 * In dev builds private hosts are allowed so local relays keep working.
 */
export function sanitizeUntrustedRelays(list: Iterable<unknown> | undefined | null): string[] {
  if (!list) return [];
  const out: string[] = [];
  for (const entry of list) {
    const norm = normalizeRelayUrl(entry);
    if (!norm) continue;
    if (!import.meta.env.DEV) {
      const hostname = new URL(norm).hostname.toLowerCase();
      if (PRIVATE_HOST_RE.test(hostname) || hostname.endsWith(".local")) continue;
    }
    out.push(norm);
  }
  return out;
}

/**
 * Sanitize an untrusted HTTPS URL (room `streaming`/`auth` tags). These URLs
 * drive fetch()/WebTransport connections and are embedded in signed NIP-98
 * events, so reject non-https schemes and (in production) private/loopback
 * hosts, exactly like relay URLs.
 *
 * Returns the normalized URL without a trailing root slash, or `null`.
 */
export function sanitizeUntrustedHttpsUrl(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  if (url.protocol !== "https:") return null;
  if (!url.hostname) return null;

  if (!import.meta.env.DEV) {
    const hostname = url.hostname.toLowerCase();
    if (PRIVATE_HOST_RE.test(hostname) || hostname.endsWith(".local")) return null;
  }

  let out = url.toString();
  if (out.endsWith("/") && url.pathname === "/") {
    out = out.slice(0, -1);
  }
  return out;
}

/**
 * Build a deduplicated list of normalized relay URLs from one or more inputs.
 * Invalid entries are silently dropped.
 */
export function dedupeRelays(...lists: Array<Iterable<unknown> | undefined | null>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of lists) {
    if (!list) continue;
    for (const entry of list) {
      const norm = normalizeRelayUrl(entry);
      if (!norm || seen.has(norm)) continue;
      seen.add(norm);
      out.push(norm);
    }
  }
  return out;
}

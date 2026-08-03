/**
 * Validate that a string is a well-formed HTTPS URL.
 *
 * Returns the normalised `href` when valid, or `undefined` otherwise.
 * This **must** be used whenever a URL originates from untrusted Nostr
 * event data (tags, metadata fields, etc.) and will be placed into an
 * `href`, `window.open()`, or `openUrl()` call.  Without this check a
 * malicious `javascript:` URI could execute arbitrary code.
 */
export function sanitizeUrl(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === 'https:') {
      return parsed.href;
    }
  } catch {
    // not a valid URL
  }
  return undefined;
}

/**
 * Returns a safe HTTPS URL only when it points to a host other than the app's
 * own. Used to decide whether to offer an "open externally" affordance: a link
 * back into our own host should navigate in-app, not pop a new tab. Returns
 * `undefined` for same-host, invalid, or non-HTTPS URLs.
 */
export function externalUrl(raw: string | undefined | null): string | undefined {
  const safe = sanitizeUrl(raw);
  if (!safe) return undefined;
  try {
    if (new URL(safe).host === window.location.host) return undefined;
  } catch {
    return undefined;
  }
  return safe;
}

/** Display hostname for a URL (drops a leading `www.`). Falls back to the raw
 *  string when it can't be parsed. */
export function displayHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

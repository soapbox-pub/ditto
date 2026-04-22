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

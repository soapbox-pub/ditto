/**
 * Helpers for handling text shared into Ditto from another app's Share button.
 *
 * Shared text is rarely a clean URL — e.g. TikTok shares something like
 * "Check out this video! https://www.tiktok.com/@user/video/123 #fyp". These
 * helpers pull a usable URL out of that mess so the "View in Ditto" share
 * target can route to the external-content comment page (/i/<url>).
 */

// Matches an http(s) URL embedded anywhere in a string. We then trim trailing
// punctuation that commonly clings to URLs in prose (commas, closing brackets,
// sentence-ending periods, etc.).
const URL_RE = /https?:\/\/[^\s<>"']+/i;

// Trailing characters that are almost never part of the URL itself when a URL
// is embedded in human-written text.
const TRAILING_PUNCTUATION = /[).,;:!?'"\]}>]+$/;

/**
 * Extract the first http(s) URL from a blob of shared text.
 *
 * Returns `undefined` when no well-formed URL is present. The returned string
 * is validated with the `URL` constructor, so callers can rely on it being
 * parseable.
 */
export function extractFirstUrl(text: string | null | undefined): string | undefined {
  if (!text) return undefined;

  const match = URL_RE.exec(text);
  if (!match) return undefined;

  let candidate = match[0].replace(TRAILING_PUNCTUATION, '');

  // Balance a trailing ")" only when it closes a "(" inside the URL (e.g.
  // Wikipedia URLs). If we stripped a ")" above but the URL contains a "(",
  // put it back.
  if (match[0].endsWith(')') && candidate.includes('(') && !candidate.includes(')')) {
    candidate += ')';
  }

  try {
    // Validate; throws on malformed input.
    const url = new URL(candidate);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

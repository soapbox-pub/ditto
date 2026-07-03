import type { NostrEvent } from '@nostrify/nostrify';

/**
 * Hashtags (`t` tags) that mark a post as sensitive even without an
 * explicit NIP-36 `content-warning` tag. Some clients (and users) only
 * tag posts with `#nsfw` or similar, so treat those as content warnings.
 * Matched case-insensitively.
 */
const SENSITIVE_HASHTAGS = new Set([
  'nsfw',
  'nsfl',
  'porn',
  'nudity',
  'nude',
  'gore',
  'explicit',
  'sensitive',
  'contentwarning',
]);

/**
 * Extracts the content-warning reason from an event's tags (NIP-36).
 * Returns the reason string, or an empty string if the tag is present with no reason,
 * or undefined if the event has no content warning.
 *
 * Checks the `content-warning` tag value, the NIP-32 `l` tag with the
 * `content-warning` namespace (since some clients put the reason only in
 * the label tag), and sensitive hashtags like `#nsfw` (since some clients
 * only hashtag sensitive posts instead of using NIP-36).
 */
export function getContentWarning(event: NostrEvent): string | undefined {
  const tag = event.tags.find(([name]) => name === 'content-warning');

  if (tag) {
    // Prefer the reason from the content-warning tag itself
    const reason = tag[1]?.trim();
    if (reason) return reason;

    // Fall back to the NIP-32 label tag with content-warning namespace
    const lTag = event.tags.find(
      ([name, , namespace]) => name === 'l' && namespace === 'content-warning',
    );
    if (lTag?.[1]?.trim()) return lTag[1].trim();

    return '';
  }

  // No explicit tag: treat sensitive hashtags (e.g. #nsfw) as a content warning
  const tTag = event.tags.find(
    ([name, value]) =>
      name === 't' && value !== undefined && SENSITIVE_HASHTAGS.has(value.trim().toLowerCase()),
  );
  if (tTag?.[1]) return tTag[1].trim().toLowerCase();

  return undefined;
}

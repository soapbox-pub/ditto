import type { NostrEvent } from '@nostrify/nostrify';

/**
 * Extracts the content-warning reason from an event's tags (NIP-36).
 * Returns the reason string, or an empty string if the tag is present with no reason,
 * or undefined if there is no content-warning tag.
 *
 * Checks both the `content-warning` tag value and the NIP-32 `l` tag with
 * the `content-warning` namespace, since some clients put the reason only
 * in the label tag.
 */
export function getContentWarning(event: NostrEvent): string | undefined {
  const tag = event.tags.find(([name]) => name === 'content-warning');
  if (!tag) return undefined;

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

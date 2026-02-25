import type { NostrEvent } from '@nostrify/nostrify';

/**
 * Extracts the parent (replied-to) event ID from an event's tags following NIP-10 conventions.
 * Supports both the preferred marked-tag scheme and the deprecated positional scheme.
 */
export function getParentEventId(event: NostrEvent): string | undefined {
  const eTags = event.tags.filter(([name]) => name === 'e');
  if (eTags.length === 0) return undefined;

  // Preferred: look for marked "reply" tag first
  const replyTag = eTags.find(([, , , marker]) => marker === 'reply');
  if (replyTag) return replyTag[1];

  // If there's a "root" marker but no "reply" marker, the event replies directly to root
  const rootTag = eTags.find(([, , , marker]) => marker === 'root');
  if (rootTag) return rootTag[1];

  // Deprecated positional scheme: last e-tag is the reply target
  if (eTags.length >= 1) return eTags[eTags.length - 1][1];

  return undefined;
}

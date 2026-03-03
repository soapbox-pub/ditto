import type { NostrEvent } from '@nostrify/nostrify';

/**
 * Returns true if the event is a reply (has a root or reply e-tag, or an unmarked e-tag).
 * e-tags with marker "mention" are intentional inline quotes and do NOT make an event a reply.
 * Follows NIP-10 conventions.
 */
export function isReplyEvent(event: NostrEvent): boolean {
  const eTags = event.tags.filter(([name]) => name === 'e');
  if (eTags.length === 0) return false;

  // If every e-tag is explicitly marked "mention", this is not a reply
  const nonMentionTags = eTags.filter(([, , , marker]) => marker !== 'mention');
  return nonMentionTags.length > 0;
}

/**
 * Extracts the parent (replied-to) event ID from an event's tags following NIP-10 conventions.
 * Supports both the preferred marked-tag scheme and the deprecated positional scheme.
 * For kind 7 reactions, uses NIP-25 semantics: the last `e` tag is the reacted-to event.
 */
export function getParentEventId(event: NostrEvent): string | undefined {
  // NIP-25: for kind 7 reactions, the target event is always the last e-tag
  if (event.kind === 7) {
    return event.tags.findLast(([name]) => name === 'e')?.[1];
  }

  // Exclude "mention" e-tags — they are inline quotes, not reply/root references
  const eTags = event.tags.filter(([name, , , marker]) => name === 'e' && marker !== 'mention');
  if (eTags.length === 0) return undefined;

  // Preferred: look for marked "reply" tag first
  const replyTag = eTags.find(([, , , marker]) => marker === 'reply');
  if (replyTag) return replyTag[1];

  // If there's a "root" marker but no "reply" marker, the event replies directly to root
  const rootTag = eTags.find(([, , , marker]) => marker === 'root');
  if (rootTag) return rootTag[1];

  // Deprecated positional scheme: last non-mention e-tag is the reply target
  return eTags[eTags.length - 1][1];
}

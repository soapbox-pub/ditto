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

/** Hints extracted from an `e` tag for relay resolution. */
export interface ParentEventHints {
  id: string;
  relayHint?: string;
  authorHint?: string;
}

/**
 * Extracts the parent (replied-to) event ID from an event's tags following NIP-10 conventions.
 * Supports both the preferred marked-tag scheme and the deprecated positional scheme.
 * For kind 7 reactions, uses NIP-25 semantics: the last `e` tag is the reacted-to event.
 */
export function getParentEventId(event: NostrEvent): string | undefined {
  return getParentEventTag(event)?.[1];
}

/**
 * Extracts the parent event ID along with relay and author hints from the `e` tag.
 * Returns the full NIP-10 hints (relay URL at position [2], author pubkey at position [4]).
 */
export function getParentEventHints(event: NostrEvent): ParentEventHints | undefined {
  const tag = getParentEventTag(event);
  if (!tag) return undefined;
  return {
    id: tag[1],
    relayHint: tag[2] || undefined,
    authorHint: tag[4] || undefined,
  };
}

/**
 * Returns the raw parent `e` tag from an event following NIP-10 conventions.
 * For kind 7 reactions, uses NIP-25 semantics: the last `e` tag is the reacted-to event.
 */
function getParentEventTag(event: NostrEvent): string[] | undefined {
  // NIP-25: for kind 7 reactions, the target event is always the last e-tag
  if (event.kind === 7) {
    return event.tags.findLast(([name]) => name === 'e');
  }

  // Exclude "mention" e-tags — they are inline quotes, not reply/root references
  const eTags = event.tags.filter(([name, , , marker]) => name === 'e' && marker !== 'mention');
  if (eTags.length === 0) return undefined;

  // Preferred: look for marked "reply" tag first
  const replyTag = eTags.find(([, , , marker]) => marker === 'reply');
  if (replyTag) return replyTag;

  // If there's a "root" marker but no "reply" marker, the event replies directly to root
  const rootTag = eTags.find(([, , , marker]) => marker === 'root');
  if (rootTag) return rootTag;

  // Deprecated positional scheme: last non-mention e-tag is the reply target
  return eTags[eTags.length - 1];
}

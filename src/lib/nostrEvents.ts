import type { NostrEvent } from '@nostrify/nostrify';

/** NIP-22 comment kinds: 1111 (text comment) and 1244 (NIP-A0 voice comment). */
const COMMENT_KINDS = new Set([1111, 1244]);

/**
 * Returns true if the event is a reply:
 * - NIP-22 comment kinds (1111 / 1244) are replies by definition.
 * - A root or reply e-tag, or an unmarked e-tag (NIP-10).
 * - An a-tag explicitly marked "root" or "reply" (NIP-10 reply to an addressable event).
 * e-tags with marker "mention" are intentional inline quotes and do NOT make an event a reply.
 */
export function isReplyEvent(event: NostrEvent): boolean {
  // NIP-22 comments always reference a parent, but comments on addressable
  // events or external content carry only `a`/`i` tags — no `e` tag — so the
  // tag checks below can't catch them.
  if (COMMENT_KINDS.has(event.kind)) return true;

  // Any e-tag not explicitly marked "mention" makes this a reply (NIP-10:
  // marked root/reply tags, or the deprecated positional scheme).
  const eTags = event.tags.filter(([name]) => name === 'e');
  if (eTags.some(([, , , marker]) => marker !== 'mention')) return true;

  // NIP-10 replies to addressable events (e.g. a kind 1 reply to an article)
  // reference the root with a marked `a` tag and may have no `e` tag at all.
  // Only marked tags count — unmarked `a` tags are plain references.
  return event.tags.some(([name, , , marker]) => name === 'a' && (marker === 'root' || marker === 'reply'));
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
 *
 * When the `e` tag doesn't include a pubkey at position [4] (many clients omit it),
 * falls back to the first `p` tag in the event, which per NIP-10 convention contains
 * the pubkey of the author being replied to.
 */
export function getParentEventHints(event: NostrEvent): ParentEventHints | undefined {
  const tag = getParentEventTag(event);
  if (!tag) return undefined;

  // Prefer the pubkey embedded in the e tag (NIP-10 position [4]).
  // Fall back to the first p tag, which conventionally holds the parent author's pubkey.
  const authorHint = tag[4] || event.tags.find(([name]) => name === 'p')?.[1] || undefined;

  return {
    id: tag[1],
    relayHint: tag[2] || undefined,
    authorHint,
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

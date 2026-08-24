import type { NostrEvent } from '@nostrify/nostrify';

import { isNostrId } from '@/lib/nostrId';
import { parseAddr } from '@/lib/parseAddr';

/** NIP-22 comment kinds: 1111 (text comment) and 1244 (NIP-A0 voice comment). */
const COMMENT_KINDS = new Set([1111, 1244]);

/**
 * Kinds that thread with NIP-10 `e` tag markers instead of NIP-22 uppercase
 * root tags: kind 1 notes and the kind 1222 voice messages that mirror them.
 * Ditto no longer publishes replies in either form, but the network is full
 * of them and they are still the parents of new replies.
 */
const NIP10_THREAD_KINDS = new Set([1, 1222]);

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

  // Prefer the pubkey embedded in the e tag — NIP-10 puts it at position [4],
  // NIP-22 at position [3]. Fall back to the first p tag, which conventionally
  // holds the parent author's pubkey in both schemes.
  const embedded = COMMENT_KINDS.has(event.kind) ? tag[3] : tag[4];
  const authorHint = embedded || event.tags.find(([name]) => name === 'p')?.[1] || undefined;

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

/**
 * The root of a NIP-10 thread, in the shape NIP-22 needs for its root scope:
 * a reference (`E` or `A`), the root kind (`K`), and the root author (`P`).
 */
export type Nip10ThreadRoot =
  | { type: 'event'; id: string; kind: number; pubkey?: string; relayHint?: string }
  | { type: 'addr'; addr: string; kind: number; pubkey: string; relayHint?: string };

/**
 * Extract the thread root from a NIP-10 reply, so a NIP-22 comment replying to
 * it can scope itself to the same root instead of starting a new thread at the
 * reply. Returns undefined when the event isn't a NIP-10 reply at all — a
 * top-level post is its own root, and callers scope to it directly.
 */
export function getNip10ThreadRoot(event: NostrEvent): Nip10ThreadRoot | undefined {
  if (!NIP10_THREAD_KINDS.has(event.kind)) return undefined;

  // Replies to an addressable event (e.g. a kind 1 reply to an article) name
  // the root with a marked `a` tag, and may carry no `e` tag at all.
  const aTag = event.tags.find(([name, , , marker]) => name === 'a' && marker === 'root');
  const addr = parseAddr(aTag?.[1]);
  if (aTag && addr) {
    return { type: 'addr', addr: aTag[1], kind: addr.kind, pubkey: addr.pubkey, relayHint: aTag[2] || undefined };
  }

  const eTags = event.tags.filter(([name, , , marker]) => name === 'e' && marker !== 'mention');
  // Preferred: the tag explicitly marked "root". Otherwise the deprecated
  // positional scheme, where the FIRST e tag is the root and the last is the
  // parent — which also covers a lone e tag that is both at once.
  const rootTag = eTags.find(([, , , marker]) => marker === 'root') ?? eTags[0];
  if (!rootTag || !isNostrId(rootTag[1])) return undefined;

  return {
    type: 'event',
    id: rootTag[1],
    // NIP-10 threads are homogeneous: a kind 1 reply roots at a kind 1 note,
    // a kind 1222 voice reply at a kind 1222 voice message.
    kind: event.kind,
    // NIP-10 pubkey hint (5th element), when the client included one.
    pubkey: isNostrId(rootTag[4]) ? rootTag[4] : undefined,
    relayHint: rootTag[2] || undefined,
  };
}

/**
 * Build a NIP-22 reference tag (`E`/`e` for events, `A`/`a` for addressable
 * coordinates), dropping trailing hints that aren't known rather than padding
 * the tag with empty strings.
 */
export function nip22RefTag(
  name: 'E' | 'e' | 'A' | 'a',
  value: string,
  relayHint?: string,
  pubkey?: string,
): string[] {
  const tag = [name, value, relayHint ?? '', pubkey ?? ''];
  while (tag.length > 2 && !tag[tag.length - 1]) tag.pop();
  return tag;
}

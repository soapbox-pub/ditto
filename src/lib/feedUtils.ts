import type { NostrEvent } from '@nostrify/nostrify';

/**
 * Minimum gap (in seconds) between consecutive events to be considered an
 * out-of-sync boundary. If a relay returns events spanning a large time
 * range (e.g., 10h newest → 4d oldest), there will be a large gap between
 * the "main cluster" and the outliers from the stale relay.
 */
const MIN_GAP_SECONDS = 6 * 60 * 60; // 6 hours

/**
 * Computes a safe pagination cursor from a set of events.
 *
 * When querying multiple relays, a stale relay may return very old events
 * alongside recent ones. Using the absolute oldest timestamp as the cursor
 * would skip everything in between. This function detects large gaps in the
 * timestamp distribution and returns the oldest timestamp from the main
 * (most recent) cluster, ignoring outliers below the gap.
 *
 * All events are still returned and displayed — only the cursor is adjusted.
 */
export function getPaginationCursor(events: NostrEvent[]): number {
  if (events.length === 0) return Math.floor(Date.now() / 1000);
  if (events.length === 1) return events[0].created_at;

  // Sort descending (newest first).
  const sorted = events.map((e) => e.created_at).sort((a, b) => b - a);

  // Walk from newest to oldest, find the first gap larger than the threshold.
  for (let i = 0; i < sorted.length - 1; i++) {
    const gap = sorted[i] - sorted[i + 1];
    if (gap >= MIN_GAP_SECONDS) {
      // The cursor is the timestamp just above the gap (the oldest event
      // in the main cluster). Events below the gap are outliers.
      return sorted[i];
    }
  }

  // No large gap found — all events are in one cluster.
  return sorted[sorted.length - 1];
}

/** The set of kind numbers that represent reposts (kind 6 for notes, kind 16 for everything else). */
export const REPOST_KINDS = new Set([6, 16]);

/** Check if a kind number is a repost kind (6 or 16). */
export function isRepostKind(kind: number): boolean {
  return REPOST_KINDS.has(kind);
}

/**
 * Returns the correct repost kind for a given event.
 * Kind 6 is only for reposting kind 1 text notes; kind 16 is for everything else.
 */
export function getRepostKind(originalEventKind: number): number {
  return originalEventKind === 1 ? 6 : 16;
}

/** A feed item — either a direct post or a repost wrapping the original event. */
export interface FeedItem {
  /** The event to display (original note). */
  event: NostrEvent;
  /** If this item is a repost, the pubkey of the person who reposted it. */
  repostedBy?: string;
  /** Sort timestamp — uses the repost timestamp when present for correct ordering. */
  sortTimestamp: number;
}

/** d-tags reserved by NIP-51 for other purposes — hide these kind 30000 events from feeds. */
const DEPRECATED_DTAGS = new Set(['mute', 'pin', 'bookmark', 'communities']);

/** Returns true if a kind 30000 event is a deprecated/junk list that should be hidden. */
function isDeprecatedFollowSet(event: NostrEvent): boolean {
  if (event.kind !== 30000) return false;
  const dTag = event.tags.find(([n]) => n === 'd')?.[1] ?? '';
  if (DEPRECATED_DTAGS.has(dTag)) return true;
  const hasPTags = event.tags.some(([n]) => n === 'p');
  const hasTitle = event.tags.some(([n]) => n === 'title' || n === 'name');
  if (!hasPTags && !hasTitle) return true;
  return false;
}

/**
 * Returns true if a feed event should be hidden at the feed level.
 * This pre-filters events BEFORE they are rendered as NoteCards,
 * preventing unnecessary component mounts and layout shifts from
 * components that would return null.
 */
export function shouldHideFeedEvent(event: NostrEvent): boolean {
  // Deprecated kind 30000 follow sets
  if (isDeprecatedFollowSet(event)) return true;
  // Unlisted magic decks (kind 37381)
  if (event.kind === 37381 && event.tags.some(([n, v]) => n === 't' && v === 'unlisted')) return true;
  // Hidden treasures (kind 37516)
  if (event.kind === 37516 && event.tags.some(([n, v]) => n === 't' && v === 'hidden')) return true;
  // Emoji packs (kind 30030) without at least one valid emoji tag
  if (event.kind === 30030 && !event.tags.some(([n, sc, url]) => n === 'emoji' && sc && url)) return true;
  // Bird detections (kind 2473) without a Wikidata entity reference — the NIP
  // requires an `i` tag pointing at https://www.wikidata.org/entity/Q<digits>.
  if (event.kind === 2473) {
    const wikidataRe = /^https:\/\/www\.wikidata\.org\/entity\/Q\d+$/;
    if (!event.tags.some(([n, v]) => n === 'i' && typeof v === 'string' && wikidataRe.test(v))) return true;
  }
  // Custom constellations (kind 30621) without any valid edge tags
  if (event.kind === 30621) {
    const hasEdge = event.tags.some(([n, from, to]) => n === 'edge' && /^\d+$/.test(from ?? '') && /^\d+$/.test(to ?? ''));
    if (!hasEdge) return true;
  }
  return false;
}

/**
 * Tries to parse the original event from a kind 6 or kind 16 repost's content.
 * Returns undefined if the content is empty or not valid JSON.
 */
export function parseRepostContent(repost: NostrEvent): NostrEvent | undefined {
  if (!repost.content || repost.content.trim() === '') return undefined;
  try {
    const parsed = JSON.parse(repost.content);
    if (parsed && typeof parsed === 'object' && parsed.id && parsed.pubkey && parsed.kind !== undefined) {
      return parsed as NostrEvent;
    }
  } catch {
    // invalid JSON
  }
  return undefined;
}

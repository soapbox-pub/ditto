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

/** A feed item — either a direct post or a repost wrapping the original event. */
export interface FeedItem {
  /** The event to display (original note). */
  event: NostrEvent;
  /** If this item is a repost, the pubkey of the person who reposted it. */
  repostedBy?: string;
  /** Sort timestamp — uses the repost timestamp when present for correct ordering. */
  sortTimestamp: number;
}

/**
 * Tries to parse the original event from a kind 6 repost's content.
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

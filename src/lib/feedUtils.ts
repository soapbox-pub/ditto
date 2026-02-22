import type { NostrEvent } from '@nostrify/nostrify';

/**
 * Maximum allowed gap between newest and oldest events in a relay response.
 * If a relay returns events spanning more than this (e.g., 10h newest → 4d oldest),
 * we filter out the outliers to prevent pagination gaps.
 *
 * Set to 6 hours - this allows for normal timeline variation while filtering
 * relays with large gaps that would skip events.
 */
const MAX_EVENT_SPAN_SECONDS = 6 * 60 * 60; // 6 hours

/**
 * Filters out events from relays that are out of sync.
 *
 * If the relay pool returns events spanning a large time range (e.g., 10h to 4d),
 * it indicates one relay is missing events and returning much older results.
 * We filter out events older than MAX_EVENT_SPAN_SECONDS from the newest event
 * to prevent pagination gaps.
 */
export function filterOutOfSyncEvents(events: NostrEvent[]): NostrEvent[] {
  if (events.length === 0) return events;

  // Find the newest event timestamp
  const newestTimestamp = Math.max(...events.map(e => e.created_at));

  // Filter out events that are too old relative to the newest
  const threshold = newestTimestamp - MAX_EVENT_SPAN_SECONDS;
  const filtered = events.filter(e => e.created_at >= threshold);

  // If we filtered out more than 30% of events, log a warning
  if (filtered.length < events.length * 0.7) {
    console.warn(
      `Filtered ${events.length - filtered.length} out-of-sync events ` +
      `(${events.length} → ${filtered.length}). ` +
      `Newest: ${new Date(newestTimestamp * 1000).toISOString()}, ` +
      `Threshold: ${new Date(threshold * 1000).toISOString()}`
    );
  }

  return filtered;
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

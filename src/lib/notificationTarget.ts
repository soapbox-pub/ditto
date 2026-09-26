import type { NostrEvent } from '@nostrify/nostrify';

/**
 * The `e` tag naming the event a notification is about — a reaction's post, a
 * repost's original, a zap's target. The last one, which is where NIP-10 and
 * NIP-25 both put the event being responded to.
 *
 * Shared by the in-app notification list and the service worker, so a tap on
 * a push lands on the same post the list would show.
 */
export function getReferencedETag(event: NostrEvent): string[] | undefined {
  return event.tags.findLast(([name]) => name === 'e');
}

/** The id from {@link getReferencedETag}. */
export function getReferencedEventId(event: NostrEvent): string | undefined {
  return getReferencedETag(event)?.[1];
}

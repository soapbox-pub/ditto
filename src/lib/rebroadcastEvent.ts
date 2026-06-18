import type { NostrEvent } from '@nostrify/nostrify';

/** Minimal interface needed to publish an event to the connection pool. */
interface NostrPublishable {
  event(event: NostrEvent, opts?: { signal?: AbortSignal }): Promise<void>;
}

/**
 * Rebroadcast an already-signed event back to the relay pool.
 *
 * Used when a user interacts with an event (reacting, reposting, replying) so
 * the original event is re-published alongside the new interaction — this keeps
 * the referenced event available on relays even if it had since fallen out.
 *
 * This is best-effort and fire-and-forget: any failure is silently ignored and
 * never blocks or surfaces to the caller.
 */
export function rebroadcastEvent(nostr: NostrPublishable, event: NostrEvent): void {
  // Only rebroadcast fully-formed, signed events. Some call sites construct
  // synthetic/partial events (e.g. reconstructed roots with empty id/sig) that
  // must never be published.
  if (!event.id || !event.sig) return;

  void nostr.event(event, { signal: AbortSignal.timeout(5000) }).catch(() => {
    // Silently ignore — rebroadcasting is best-effort.
  });
}

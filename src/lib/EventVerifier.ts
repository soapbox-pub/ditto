import { getEventHash, verifyEvent } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';

/**
 * `verifyEvent` with a cache, for use as the `verifyEvent` option of
 * `NRelay1`. Share one instance across every relay connection in a pool.
 *
 * `NPool` sends every REQ to all of the user's read relays, so a popular event
 * arrives once per relay and each copy is a fresh object parsed from JSON.
 * nostr-tools memoizes verification on the event object itself, which does
 * nothing across connections — so the same Schnorr verification runs three or
 * more times for one event. In a production trace, 12% of all CPU went to
 * relay message handling, and 64% of that was secp256k1 point arithmetic.
 *
 * Caching by id is sound because `id` is a SHA-256 over
 * `[0, pubkey, created_at, kind, tags, content]`. Every signed field is
 * committed to by the hash, so two events sharing an id differ only in `sig`.
 * Once we have seen a valid signature for an id, the payload behind that id is
 * proven authentic, and re-running Schnorr on a second copy cannot tell us
 * anything new. We still recompute the hash on a cache hit, so a forged event
 * that merely claims a known id is rejected.
 */
export class EventVerifier {
  /** Ids whose signature we have already checked. Iterates in insertion order. */
  private verified = new Set<string>();

  /**
   * @param maxRemembered How many verified event ids to remember. Each entry is
   * a 64-character hex string, so the default costs on the order of a megabyte.
   */
  constructor(private maxRemembered = 10_000) {}

  /**
   * Verify an event, consulting the cache first. Bound to the instance so it
   * can be passed directly as a callback.
   */
  verify = (event: NostrEvent): boolean => {
    if (this.verified.has(event.id)) {
      // Cheap: one SHA-256 instead of a Schnorr verification.
      return getEventHash(event) === event.id;
    }

    if (!verifyEvent(event)) {
      return false;
    }

    this.remember(event.id);
    return true;
  };

  private remember(id: string): void {
    this.verified.add(id);
    if (this.verified.size > this.maxRemembered) {
      const oldest = this.verified.values().next().value;
      if (oldest !== undefined) this.verified.delete(oldest);
    }
  }
}

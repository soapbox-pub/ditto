import { getEventHash, verifyEvent } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';

type Hashed = Pick<NostrEvent, 'pubkey' | 'created_at' | 'kind' | 'tags' | 'content'>;

/**
 * How many verified copies to keep for field comparison. Unlike the ids these
 * hold whole events, long-form content included, so far fewer are kept.
 */
const MAX_COPIES = 2048;

function tagsEqual(a: string[][], b: string[][]): boolean {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i], y = b[i];
    if (!Array.isArray(x) || !Array.isArray(y) || x.length !== y.length) return false;
    for (let j = 0; j < x.length; j++) if (x[j] !== y[j]) return false;
  }
  return true;
}

function sameHashedFields(seen: Hashed, event: NostrEvent): boolean {
  return (
    seen.content === event.content &&
    seen.pubkey === event.pubkey &&
    seen.created_at === event.created_at &&
    seen.kind === event.kind &&
    tagsEqual(seen.tags, event.tags)
  );
}

import { isValidZapReceipt } from '@/lib/zapReceipt';

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
 *
 * A copy whose hashed fields all equal a remembered copy has the same hash,
 * so for recently seen ids a field comparison stands in for the SHA-256: the
 * hash needs a JSON serialization of the whole event, the comparison doesn't.
 *
 * Kind 9735 zap receipts must also be internally consistent (see
 * `isValidZapReceipt`); the cache covers that too, since it depends only on
 * the hashed fields.
 */
export class EventVerifier {
  /** Ids whose signature we have already checked. Iterates in insertion order. */
  private verified = new Set<string>();
  /** Snapshots of recently verified events, by id. Iterates in insertion order. */
  private copies = new Map<string, Hashed>();

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
      const seen = this.copies.get(event.id);
      if (seen && sameHashedFields(seen, event)) return true;
      // Cheap: one SHA-256 instead of a Schnorr verification.
      try {
        return getEventHash(event) === event.id;
      } catch {
        return false;
      }
    }

    if (!verifyEvent(event)) {
      return false;
    }

    if (event.kind === 9735 && !isValidZapReceipt(event)) {
      return false;
    }

    this.remember(event);
    return true;
  };

  private remember(event: NostrEvent): void {
    this.verified.add(event.id);
    if (this.verified.size > this.maxRemembered) {
      const oldest = this.verified.values().next().value;
      if (oldest !== undefined) this.verified.delete(oldest);
    }

    // A snapshot: a caller may go on to mutate the object it passed.
    const { pubkey, created_at, kind, content } = event;
    this.copies.set(event.id, { pubkey, created_at, kind, content, tags: event.tags.map((t) => [...t]) });
    if (this.copies.size > MAX_COPIES) {
      const oldest = this.copies.keys().next().value;
      if (oldest !== undefined) this.copies.delete(oldest);
    }
  }
}

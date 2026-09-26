import { NSchema as n, type NostrEvent } from '@nostrify/nostrify';
import { verifyEvent } from 'nostr-tools/pure';

const eventSchema = n.event();

/**
 * A well-formed, validly signed Nostr event, or null. Everything the worker
 * handles arrives from a relay by way of a push transport that checks neither
 * — Tenna doesn't verify before delivery — so nothing is read until it has
 * passed through here. Without the signature check a hostile relay could put
 * words in a stranger's mouth, or a stranger's face on its own words.
 */
export function parseEvent(candidate: unknown): NostrEvent | null {
  const result = eventSchema.safeParse(candidate);
  if (!result.success) return null;
  try {
    return verifyEvent(result.data) ? result.data : null;
  } catch {
    return null;
  }
}

import { NSchema as n, type NostrEvent } from '@nostrify/nostrify';

const eventSchema = n.event();

/**
 * A well-formed Nostr event, or null. Everything the worker handles arrives
 * from a relay by way of a push transport with no schema, so nothing is read
 * until it has passed through here.
 */
export function parseEvent(candidate: unknown): NostrEvent | null {
  const result = eventSchema.safeParse(candidate);
  return result.success ? result.data : null;
}

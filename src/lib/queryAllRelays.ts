import type { NostrEvent, NostrFilter, NPool } from '@nostrify/nostrify';

/** Give up on relays that haven't finished by then, keeping whatever they sent. */
const DEFAULT_TIMEOUT_MS = 5000;

/**
 * Like `nostr.query`, but waits for each relay to finish instead of the pool's
 * short grace period after the first one. Letters live on only some relays:
 * one that has none and answers first would otherwise end the query empty,
 * and that empty result would replace the inbox.
 */
export async function queryAllRelays(
  nostr: NPool,
  relays: string[],
  filters: NostrFilter[],
  opts: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<NostrEvent[]> {
  const timeout = AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;
  const events = new Map<string, NostrEvent>();

  await Promise.all([...new Set(relays)].map(async (url) => {
    try {
      for await (const msg of nostr.relay(url).req(filters, { signal })) {
        if (msg[0] === 'EVENT') events.set(msg[2].id, msg[2]);
        else if (msg[0] === 'EOSE' || msg[0] === 'CLOSED') break;
      }
    } catch {
      // Timed out, unreachable or cancelled: keep what this relay sent
    }
  }));

  opts.signal?.throwIfAborted();
  return [...events.values()];
}

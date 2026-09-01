import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';
import type { NRelay } from '@nostrify/types';

/**
 * Low-level relay I/O for bulk account transfers.
 *
 * These talk to a single relay at a time via `nostr.relay(url)`, which bypasses
 * `AppPool`'s batching and caching — appropriate here, because the whole point
 * is to know exactly which relay a given event came from or went to.
 */

/** Events requested per REQ. Most relays cap somewhere near this. */
const PAGE_LIMIT = 500;

/** How long to wait for a NIP-45 COUNT before giving up on a determinate bar. */
const COUNT_TIMEOUT = 4_000;

/** Concurrent EVENT publishes per relay. */
const PUSH_CONCURRENCY = 8;

/** Per-event publish timeout. */
const PUSH_TIMEOUT = 10_000;

/**
 * Walk a relay's full history for a filter, yielding one page of new events at
 * a time.
 *
 * Relays cap how many events a single REQ returns, so this pages backwards with
 * `until`. The boundary second is deliberately re-requested rather than skipped
 * (`until` is inclusive): several events can share one `created_at`, and
 * stepping past the second would silently drop the rest of them. The `seen` set
 * absorbs the resulting overlap.
 */
export async function* pullRelayEvents(
  relay: NRelay,
  filter: NostrFilter,
  signal: AbortSignal,
): AsyncGenerator<NostrEvent[]> {
  const seen = new Set<string>();
  let until: number | undefined;

  while (!signal.aborted) {
    const page: NostrEvent[] = [];

    const req: NostrFilter = { ...filter, limit: PAGE_LIMIT };
    if (until !== undefined) req.until = until;

    for await (const msg of relay.req([req], { signal })) {
      if (msg[0] === 'EVENT') {
        page.push(msg[2]);
      } else if (msg[0] === 'EOSE') {
        break;
      } else if (msg[0] === 'CLOSED') {
        throw new Error(msg[2] || 'Relay closed the subscription');
      }
    }

    const fresh = page.filter((event) => !seen.has(event.id));
    for (const event of fresh) seen.add(event.id);

    // Nothing new: either the relay is exhausted, or every event in the page
    // shares the boundary second and we've already taken them all.
    if (!fresh.length) return;

    yield fresh;

    // A short page means the relay has nothing older left.
    if (page.length < PAGE_LIMIT) return;

    const oldest = page.reduce((min, event) => Math.min(min, event.created_at), Infinity);
    if (!Number.isFinite(oldest)) return;
    until = oldest;
  }
}

/**
 * Best-effort NIP-45 event count, used to make the progress bar determinate.
 *
 * Most relays don't implement COUNT, so failure is the common case and is not
 * an error — the caller just falls back to an indeterminate bar.
 */
export async function countRelayEvents(
  relay: NRelay,
  filter: NostrFilter,
  signal: AbortSignal,
): Promise<number | undefined> {
  if (!relay.count) return undefined;

  try {
    const result = await relay.count([filter], {
      signal: AbortSignal.any([signal, AbortSignal.timeout(COUNT_TIMEOUT)]),
    });
    return typeof result.count === 'number' && result.count >= 0 ? result.count : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Publish events to one relay, a few at a time, reporting after each chunk.
 *
 * If the very first chunk is rejected outright and there is more to send, this
 * throws instead of grinding through thousands of doomed publishes — a relay
 * that requires payment, requires AUTH, or refuses writes rejects everything,
 * and the user is better served by one clear error on that relay's row than by
 * a progress bar that fills up with failures.
 */
export async function pushRelayEvents(
  relay: NRelay,
  events: NostrEvent[],
  signal: AbortSignal,
  onChunk: (accepted: string[], rejected: number) => void,
): Promise<void> {
  let totalAccepted = 0;

  for (let i = 0; i < events.length; i += PUSH_CONCURRENCY) {
    signal.throwIfAborted();

    const chunk = events.slice(i, i + PUSH_CONCURRENCY);

    const results = await Promise.allSettled(
      chunk.map((event) =>
        relay.event(event, { signal: AbortSignal.any([signal, AbortSignal.timeout(PUSH_TIMEOUT)]) }),
      ),
    );

    const accepted: string[] = [];
    let rejected = 0;
    let firstReason: unknown;

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        accepted.push(chunk[index].id);
      } else {
        rejected++;
        firstReason ??= result.reason;
      }
    });

    totalAccepted += accepted.length;

    const remaining = events.length - (i + chunk.length);
    if (!totalAccepted && rejected === chunk.length && remaining > 0) {
      throw firstReason instanceof Error ? firstReason : new Error(String(firstReason ?? 'Relay rejected the events'));
    }

    onChunk(accepted, rejected);
  }
}

/** Short, human-readable failure text for a relay row. */
export function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown error';
}

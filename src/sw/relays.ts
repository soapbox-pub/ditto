/**
 * One-shot relay lookups. Each opens a socket, asks for one event and hangs
 * up — a worker lives for seconds per push, so a pool's long-lived,
 * reconnecting connections would be all cost and no benefit.
 */

import type { NostrFilter } from '@nostrify/nostrify';

/** Relays asked at once for a missing event, or for an author's profile. */
const RELAY_FANOUT = 4;
/**
 * How long to wait for an event the push was too small to carry. Longer than a
 * profile lookup — without it there is no notification worth reading — but
 * still far inside the twenty seconds the host waits on `waitUntil()`.
 */
const EVENT_TIMEOUT_MS = 5000;

/**
 * Ask one relay for one event over a short-lived socket. Resolves with the
 * first `EVENT` it sends, or null on EOSE, error, close or timeout — it never
 * rejects, because every caller here would rather show something than nothing.
 *
 * What comes back is whatever the relay sent: callers validate it.
 */
function requestEvent(relay: string, filter: NostrFilter, timeoutMs: number): Promise<unknown> {
  return new Promise((resolve) => {
    let socket: WebSocket | undefined;
    let settled = false;

    const finish = (event: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        socket?.close();
      } catch { /* already gone */ }
      resolve(event ?? null);
    };

    const timer = setTimeout(() => finish(null), timeoutMs);

    try {
      socket = new WebSocket(relay);
    } catch {
      return finish(null);
    }

    const subId = `sw-req-${Math.random().toString(36).slice(2, 10)}`;

    socket.onopen = () => {
      socket?.send(JSON.stringify(['REQ', subId, { ...filter, limit: 1 }]));
    };

    socket.onmessage = (message) => {
      let frame: unknown;
      try {
        frame = JSON.parse(message.data);
      } catch {
        return;
      }
      if (!Array.isArray(frame) || frame[1] !== subId) return;

      if (frame[0] === 'EVENT' && frame[2] && typeof frame[2] === 'object') {
        finish(frame[2]);
      } else if (frame[0] === 'CLOSED' || frame[0] === 'EOSE') {
        finish(null);
      }
    };

    socket.onerror = () => finish(null);
    socket.onclose = () => finish(null);
  });
}

/**
 * Ask several relays at once and take the first answer `accept` turns into a
 * `T`. A relay that is unreachable, slow, or simply doesn't have it must not
 * spend the budget the others would have used; `Promise.any()` settles on the
 * first hit and only gives up when every one of them has.
 */
export async function requestEventFromAny<T>(
  relays: string[],
  filter: NostrFilter,
  timeoutMs: number,
  accept: (candidate: unknown) => T | null,
): Promise<T | null> {
  const targets = relays.slice(0, RELAY_FANOUT);
  if (!targets.length) return null;

  const attempts = targets.map(async (relay) => {
    const accepted = accept(await requestEvent(relay, filter, timeoutMs));
    if (accepted === null) throw new Error('no match');
    return accepted;
  });

  try {
    return await Promise.any(attempts);
  } catch {
    return null;
  }
}

/**
 * The event a push was too small to carry. `event_id` and `relays` are what the
 * host sends in its place — see NAPP.md — and this is the fetch they're for.
 */
export function fetchEventById<T>(relays: string[], id: string, accept: (candidate: unknown) => T | null): Promise<T | null> {
  return requestEventFromAny(relays, { ids: [id] }, EVENT_TIMEOUT_MS, accept);
}

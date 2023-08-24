import { type Event, matchFilters } from '@/deps.ts';

import type { DittoFilter } from '@/types.ts';

/** Nostr subscription to receive realtime events. */
interface Subscription {
  /** User-defined NIP-01 subscription ID. */
  id: string;
  /** Event filters for the subscription. */
  filters: DittoFilter[];
  /** WebSocket to deliver results to. */
  socket: WebSocket;
}

/**
 * Manages Ditto event subscriptions.
 *
 * Subscriptions can be added, removed, and matched against events.
 *
 * ```ts
 * for (const sub of Sub.matches(event)) {
 *   // Send event to sub.socket
 *   sub.socket.send(JSON.stringify(event));
 * }
 * ```
 */
class SubscriptionStore {
  #store = new Map<WebSocket, Map<string, Subscription>>();

  /** Add a subscription to the store. */
  sub(data: Subscription): void {
    let subs = this.#store.get(data.socket);

    if (!subs) {
      subs = new Map();
      this.#store.set(data.socket, subs);
    }

    subs.set(data.id, data);
  }

  /** Remove a subscription from the store. */
  unsub(sub: Pick<Subscription, 'socket' | 'id'>): void {
    this.#store.get(sub.socket)?.delete(sub.id);
  }

  /** Remove an entire socket. */
  close(socket: WebSocket): void {
    this.#store.delete(socket);
  }

  /**
   * Loop through matching subscriptions to stream out.
   *
   * ```ts
   * for (const sub of Sub.matches(event)) {
   *   // Send event to sub.socket
   *   sub.socket.send(JSON.stringify(event));
   * }
   * ```
   */
  *matches(event: Event): Iterable<Subscription> {
    for (const subs of this.#store.values()) {
      for (const sub of subs.values()) {
        if (matchFilters(sub.filters, event)) {
          yield sub;
        }
      }
    }
  }
}

const Sub = new SubscriptionStore();

export { Sub };

import { type Event } from '@/deps.ts';
import { isParameterizedReplaceableKind, isReplaceableKind } from '@/kinds.ts';

/** In-memory store for Nostr events with replaceable event functionality. */
class EventSet<E extends Event = Event> implements Set<E> {
  #map = new Map<string, E>();

  get size() {
    return this.#map.size;
  }

  add(event: E): this {
    if (isReplaceableKind(event.kind) || isParameterizedReplaceableKind(event.kind)) {
      for (const e of this.values()) {
        if (EventSet.eventReplaces(event, e)) {
          this.delete(e);
        }
      }
    }
    this.#map.set(event.id, event);
    return this;
  }

  clear(): void {
    this.#map.clear();
  }

  delete(event: E): boolean {
    return this.#map.delete(event.id);
  }

  forEach(callbackfn: (event: E, key: E, set: Set<E>) => void, thisArg?: any): void {
    return this.#map.forEach((event, _id) => callbackfn(event, event, this), thisArg);
  }

  has(event: E): boolean {
    return this.#map.has(event.id);
  }

  *entries(): IterableIterator<[E, E]> {
    for (const event of this.#map.values()) {
      yield [event, event];
    }
  }

  keys(): IterableIterator<E> {
    return this.#map.values();
  }

  values(): IterableIterator<E> {
    return this.#map.values();
  }

  [Symbol.iterator](): IterableIterator<E> {
    return this.#map.values();
  }

  [Symbol.toStringTag]: string = 'EventSet';

  /** Returns true if both events are replaceable, belong to the same pubkey (and `d` tag, for parameterized events), and the first event is newer than the second one. */
  static eventReplaces(event: Event, event2: Event): boolean {
    if (isReplaceableKind(event.kind)) {
      return event.kind === event2.kind && event.pubkey === event2.pubkey && event.created_at > event2.created_at;
    } else if (isParameterizedReplaceableKind(event.kind)) {
      const d = event.tags.find(([name]) => name === 'd')?.[1] || '';
      const d2 = event2.tags.find(([name]) => name === 'd')?.[1] || '';

      return event.kind === event2.kind &&
        event.pubkey === event2.pubkey &&
        d === d2 &&
        event.created_at > event2.created_at;
    }
    return false;
  }
}

export { EventSet };

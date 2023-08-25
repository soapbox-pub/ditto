import { type Event } from '@/deps.ts';
import { matchDittoFilters } from '@/filter.ts';

import type { DittoFilter, EventData } from '@/types.ts';

class Subscription<K extends number = number> implements AsyncIterable<Event<K>> {
  filters: DittoFilter<K>[];
  #next?: (event: Event<K>) => void;
  #closed = false;

  constructor(filters: DittoFilter<K>[]) {
    this.filters = filters;
  }

  stream(event: Event<K>): void {
    if (this.#next) {
      this.#next(event);
      this.#next = undefined;
    }
  }

  matches(event: Event, data: EventData): boolean {
    return matchDittoFilters(this.filters, event, data);
  }

  close() {
    this.#closed = true;
    this.#next?.(undefined!);
  }

  async *[Symbol.asyncIterator]() {
    while (true) {
      const event = await new Promise<Event<K>>((resolve) => {
        this.#next = resolve;
      });

      if (this.#closed) {
        return;
      }

      yield event;
    }
  }
}

export { Subscription };

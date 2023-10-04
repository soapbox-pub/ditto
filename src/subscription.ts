import { type Event, Machina } from '@/deps.ts';
import { type DittoFilter, matchDittoFilters } from '@/filter.ts';

import type { EventData } from '@/types.ts';

class Subscription<K extends number = number> implements AsyncIterable<Event<K>> {
  filters: DittoFilter<K>[];
  #machina: Machina<Event<K>>;

  constructor(filters: DittoFilter<K>[]) {
    this.filters = filters;
    this.#machina = new Machina();
  }

  stream(event: Event<K>): void {
    this.#machina.push(event);
  }

  matches(event: Event, data: EventData): boolean {
    return matchDittoFilters(this.filters, event, data);
  }

  close() {
    this.#machina.close();
  }

  [Symbol.asyncIterator]() {
    return this.#machina.stream();
  }
}

export { Subscription };

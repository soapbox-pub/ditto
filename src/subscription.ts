import { type Event, Machina } from '@/deps.ts';
import { type DittoFilter, matchDittoFilters } from '@/filter.ts';
import { type DittoEvent } from '@/storages/types.ts';

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

  matches(event: DittoEvent): boolean {
    return matchDittoFilters(this.filters, event);
  }

  close() {
    this.#machina.close();
  }

  [Symbol.asyncIterator]() {
    return this.#machina.stream();
  }
}

export { Subscription };

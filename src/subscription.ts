import { Machina, type NostrEvent } from '@/deps.ts';
import { matchDittoFilters } from '@/filter.ts';
import { type DittoFilter } from '@/interfaces/DittoFilter.ts';
import { type DittoEvent } from '@/interfaces/DittoEvent.ts';

class Subscription implements AsyncIterable<NostrEvent> {
  filters: DittoFilter[];
  #machina: Machina<NostrEvent>;

  constructor(filters: DittoFilter[]) {
    this.filters = filters;
    this.#machina = new Machina();
  }

  stream(event: NostrEvent): void {
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

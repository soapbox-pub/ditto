import { NostrFilter } from '@soapbox/nspec';
import { Machina, matchFilters, type NostrEvent } from '@/deps.ts';
import { type DittoEvent } from '@/interfaces/DittoEvent.ts';

class Subscription implements AsyncIterable<NostrEvent> {
  filters: NostrFilter[];
  #machina: Machina<NostrEvent>;

  constructor(filters: NostrFilter[]) {
    this.filters = filters;
    this.#machina = new Machina();
  }

  stream(event: NostrEvent): void {
    this.#machina.push(event);
  }

  matches(event: DittoEvent): boolean {
    // TODO: Match `search` field.
    return matchFilters(this.filters, event);
  }

  close() {
    this.#machina.close();
  }

  [Symbol.asyncIterator]() {
    return this.#machina.stream();
  }
}

export { Subscription };

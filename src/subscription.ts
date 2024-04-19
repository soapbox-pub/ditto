import { NIP50, NostrEvent, NostrFilter } from '@nostrify/nostrify';
import { Machina, matchFilter } from '@/deps.ts';
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
    for (const filter of this.filters) {
      if (matchFilter(filter, event)) {
        if (filter.search) {
          const tokens = NIP50.parseInput(filter.search);

          const domain = (tokens.find((t) =>
            typeof t === 'object' && t.key === 'domain'
          ) as { key: 'domain'; value: string } | undefined)?.value;

          if (domain) {
            return domain === event.author_domain;
          }
        }

        return true;
      }
    }

    return false;
  }

  close() {
    this.#machina.close();
  }

  [Symbol.asyncIterator]() {
    return this.#machina.stream();
  }
}

export { Subscription };

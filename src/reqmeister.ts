import * as client from '@/client.ts';
import { Event, Filter } from '@/deps.ts';

import { EventEmitter } from 'npm:tseep';
import { eventToMicroFilter, getFilterId, type MicroFilter } from '@/filter.ts';

interface ReqmeisterOpts {
  delay?: number;
  timeout?: number;
}

type ReqmeisterQueueItem = [string, MicroFilter, WebSocket['url'][]];

class Reqmeister extends EventEmitter<{ [filterId: string]: (event: Event) => any }> {
  #opts: ReqmeisterOpts;
  #queue: ReqmeisterQueueItem[] = [];
  #promise!: Promise<void>;
  #resolve!: () => void;

  constructor(opts: ReqmeisterOpts = {}) {
    super();
    this.#opts = opts;
    this.#cycle();
    this.#perform();
  }

  #cycle() {
    this.#resolve?.();
    this.#promise = new Promise((resolve) => {
      this.#resolve = resolve;
    });
  }

  async #perform() {
    const { delay } = this.#opts;
    await new Promise((resolve) => setTimeout(resolve, delay));

    const queue = this.#queue;
    this.#queue = [];

    const wantedEvents = new Set<Event['id']>();
    const wantedAuthors = new Set<Event['pubkey']>();

    // TODO: batch by relays.
    for (const [_filterId, filter, _relays] of queue) {
      if ('ids' in filter) {
        filter.ids.forEach((id) => wantedEvents.add(id));
      } else {
        wantedAuthors.add(filter.authors[0]);
      }
    }

    const filters: Filter[] = [];

    if (wantedEvents.size) filters.push({ ids: [...wantedEvents] });
    if (wantedAuthors.size) filters.push({ kinds: [0], authors: [...wantedAuthors] });

    const events = await client.getFilters(filters, { timeout: this.#opts.timeout });

    for (const event of events) {
      this.encounter(event);
    }

    this.#cycle();
    this.#perform();
  }

  req(filter: MicroFilter, relays: WebSocket['url'][] = []): Promise<Event> {
    const filterId = getFilterId(filter);
    this.#queue.push([filterId, filter, relays]);
    return new Promise<Event>((resolve, reject) => {
      this.once(filterId, resolve);
      this.#promise.finally(reject);
    });
  }

  encounter(event: Event): void {
    const filterId = getFilterId(eventToMicroFilter(event));
    this.#queue = this.#queue.filter(([id]) => id !== filterId);
    this.emit(filterId, event);
  }

  isWanted(event: Event): boolean {
    const filterId = getFilterId(eventToMicroFilter(event));
    return this.#queue.some(([id]) => id === filterId);
  }
}

export { Reqmeister };

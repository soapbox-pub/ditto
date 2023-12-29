import { client } from '@/client.ts';
import { Debug, type Event, EventEmitter, type Filter } from '@/deps.ts';
import { AuthorMicrofilter, eventToMicroFilter, getFilterId, IdMicrofilter, type MicroFilter } from '@/filter.ts';
import { Time } from '@/utils/time.ts';

const debug = Debug('ditto:reqmeister');

interface ReqmeisterOpts {
  delay?: number;
  timeout?: number;
}

interface ReqmeisterReqOpts {
  relays?: WebSocket['url'][];
  signal?: AbortSignal;
}

type ReqmeisterQueueItem = [string, MicroFilter, WebSocket['url'][]];

/** Batches requests to Nostr relays using microfilters. */
class Reqmeister extends EventEmitter<{ [filterId: string]: (event: Event) => any }> {
  #opts: ReqmeisterOpts;
  #queue: ReqmeisterQueueItem[] = [];
  #promise!: Promise<void>;
  #resolve!: () => void;

  constructor(opts: ReqmeisterOpts = {}) {
    super();
    this.#opts = opts;
    this.#tick();
    this.#perform();
  }

  #tick() {
    this.#resolve?.();
    this.#promise = new Promise((resolve) => {
      this.#resolve = resolve;
    });
  }

  async #perform() {
    const { delay, timeout = Time.seconds(1) } = this.#opts;
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

    if (filters.length) {
      debug('REQ', JSON.stringify(filters));
      const events = await client.getEvents(filters, { signal: AbortSignal.timeout(timeout) });

      for (const event of events) {
        this.encounter(event);
      }
    }

    this.#tick();
    this.#perform();
  }

  req(filter: IdMicrofilter, opts?: ReqmeisterReqOpts): Promise<Event>;
  req(filter: AuthorMicrofilter, opts?: ReqmeisterReqOpts): Promise<Event<0>>;
  req(filter: MicroFilter, opts?: ReqmeisterReqOpts): Promise<Event>;
  req(filter: MicroFilter, opts: ReqmeisterReqOpts = {}): Promise<Event> {
    const { relays = [], signal } = opts;
    if (signal?.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));

    const filterId = getFilterId(filter);

    this.#queue.push([filterId, filter, relays]);

    return new Promise<Event>((resolve, reject) => {
      this.once(filterId, resolve);
      this.#promise.finally(() => setTimeout(reject, 0));
      signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
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

const reqmeister = new Reqmeister({
  delay: Time.seconds(1),
  timeout: Time.seconds(1),
});

export { reqmeister };

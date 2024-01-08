import { Debug, type Event, EventEmitter, type Filter } from '@/deps.ts';
import {
  AuthorMicrofilter,
  eventToMicroFilter,
  getFilterId,
  IdMicrofilter,
  isMicrofilter,
  type MicroFilter,
} from '@/filter.ts';
import { type EventStore, GetEventsOpts } from '@/storages/types.ts';
import { Time } from '@/utils/time.ts';

interface ReqmeisterOpts {
  client: EventStore;
  delay?: number;
  timeout?: number;
}

interface ReqmeisterReqOpts {
  relays?: WebSocket['url'][];
  signal?: AbortSignal;
}

type ReqmeisterQueueItem = [string, MicroFilter, WebSocket['url'][]];

/** Batches requests to Nostr relays using microfilters. */
class Reqmeister extends EventEmitter<{ [filterId: string]: (event: Event) => any }> implements EventStore {
  #debug = Debug('ditto:reqmeister');

  #opts: ReqmeisterOpts;
  #queue: ReqmeisterQueueItem[] = [];
  #promise!: Promise<void>;
  #resolve!: () => void;

  supportedNips = [];

  constructor(opts: ReqmeisterOpts) {
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
    const { client, delay, timeout = Time.seconds(1) } = this.#opts;
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
      this.#debug('REQ', JSON.stringify(filters));
      const events = await client.filter(filters, { signal: AbortSignal.timeout(timeout) });

      for (const event of events) {
        this.add(event);
      }
    }

    this.#tick();
    this.#perform();
  }

  req(filter: IdMicrofilter, opts?: ReqmeisterReqOpts): Promise<Event>;
  req(filter: AuthorMicrofilter, opts?: ReqmeisterReqOpts): Promise<Event<0>>;
  req(filter: MicroFilter, opts?: ReqmeisterReqOpts): Promise<Event>;
  req(filter: MicroFilter, opts: ReqmeisterReqOpts = {}): Promise<Event> {
    const {
      relays = [],
      signal = AbortSignal.timeout(this.#opts.timeout ?? 1000),
    } = opts;

    if (signal.aborted) {
      return Promise.reject(new DOMException('Aborted', 'AbortError'));
    }

    const filterId = getFilterId(filter);

    this.#queue.push([filterId, filter, relays]);

    return new Promise<Event>((resolve, reject) => {
      const handleEvent = (event: Event) => {
        resolve(event);
        this.removeListener(filterId, handleEvent);
      };

      const handleAbort = () => {
        reject(new DOMException('Aborted', 'AbortError'));
        this.removeListener(filterId, resolve);
        signal.removeEventListener('abort', handleAbort);
      };

      this.once(filterId, handleEvent);
      signal.addEventListener('abort', handleAbort, { once: true });
    });
  }

  add(event: Event): Promise<void> {
    const filterId = getFilterId(eventToMicroFilter(event));
    this.#queue = this.#queue.filter(([id]) => id !== filterId);
    this.emit(filterId, event);
    return Promise.resolve();
  }

  isWanted(event: Event): boolean {
    const filterId = getFilterId(eventToMicroFilter(event));
    return this.#queue.some(([id]) => id === filterId);
  }

  filter<K extends number>(filters: Filter<K>[], opts?: GetEventsOpts | undefined): Promise<Event<K>[]> {
    if (opts?.signal?.aborted) return Promise.resolve([]);
    if (!filters.length) return Promise.resolve([]);

    const promises = filters.reduce<Promise<Event<K>>[]>((result, filter) => {
      if (isMicrofilter(filter)) {
        result.push(this.req(filter) as Promise<Event<K>>);
      }
      return result;
    }, []);

    return Promise.all(promises);
  }

  count(_filters: Filter[]): Promise<number> {
    throw new Error('COUNT not implemented.');
  }

  deleteFilters(_filters: Filter[]): Promise<void> {
    throw new Error('DELETE not implemented.');
  }
}

export { Reqmeister };

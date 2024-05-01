import { NostrEvent, NostrFilter, NStore } from '@nostrify/nostrify';
import Debug from '@soapbox/stickynotes/debug';
import { EventEmitter } from 'tseep';

import { eventToMicroFilter, getFilterId, isMicrofilter, type MicroFilter } from '@/filter.ts';
import { Time } from '@/utils/time.ts';
import { abortError } from '@/utils/abort.ts';

interface ReqmeisterOpts {
  client: NStore;
  delay?: number;
  timeout?: number;
}

interface ReqmeisterReqOpts {
  relays?: WebSocket['url'][];
  signal?: AbortSignal;
}

type ReqmeisterQueueItem = [string, MicroFilter, WebSocket['url'][]];

/** Batches requests to Nostr relays using microfilters. */
class Reqmeister extends EventEmitter<{ [filterId: string]: (event: NostrEvent) => any }> implements NStore {
  #debug = Debug('ditto:reqmeister');

  #opts: ReqmeisterOpts;
  #queue: ReqmeisterQueueItem[] = [];
  #promise!: Promise<void>;
  #resolve!: () => void;

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

    const wantedEvents = new Set<NostrEvent['id']>();
    const wantedAuthors = new Set<NostrEvent['pubkey']>();

    // TODO: batch by relays.
    for (const [_filterId, filter, _relays] of queue) {
      if ('ids' in filter) {
        filter.ids.forEach((id) => wantedEvents.add(id));
      } else {
        wantedAuthors.add(filter.authors[0]);
      }
    }

    const filters: NostrFilter[] = [];

    if (wantedEvents.size) filters.push({ ids: [...wantedEvents] });
    if (wantedAuthors.size) filters.push({ kinds: [0], authors: [...wantedAuthors] });

    if (filters.length) {
      try {
        const events = await client.query(filters, { signal: AbortSignal.timeout(timeout) });

        for (const event of events) {
          this.event(event);
        }
      } catch (_e) {
        // do nothing
      }
    }

    this.#tick();
    this.#perform();
  }

  req(filter: MicroFilter, opts: ReqmeisterReqOpts = {}): Promise<NostrEvent> {
    const {
      relays = [],
      signal = AbortSignal.timeout(this.#opts.timeout ?? 1000),
    } = opts;

    if (signal.aborted) {
      return Promise.reject(abortError());
    }

    const filterId = getFilterId(filter);

    this.#queue.push([filterId, filter, relays]);

    return new Promise<NostrEvent>((resolve, reject) => {
      const handleEvent = (event: NostrEvent) => {
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

  event(event: NostrEvent, _opts?: { signal?: AbortSignal }): Promise<void> {
    const filterId = getFilterId(eventToMicroFilter(event));
    this.#queue = this.#queue.filter(([id]) => id !== filterId);
    this.emit(filterId, event);
    return Promise.resolve();
  }

  isWanted(event: NostrEvent): boolean {
    const filterId = getFilterId(eventToMicroFilter(event));
    return this.#queue.some(([id]) => id === filterId);
  }

  query(filters: NostrFilter[], opts?: { signal?: AbortSignal }): Promise<NostrEvent[]> {
    if (opts?.signal?.aborted) return Promise.reject(abortError());

    this.#debug('REQ', JSON.stringify(filters));
    if (!filters.length) return Promise.resolve([]);

    const promises = filters.reduce<Promise<NostrEvent>[]>((result, filter) => {
      if (isMicrofilter(filter)) {
        result.push(this.req(filter, opts));
      }
      return result;
    }, []);

    return Promise.all(promises);
  }
}

export { Reqmeister };

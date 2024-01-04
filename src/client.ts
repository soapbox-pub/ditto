import { Debug, type Event, type Filter, matchFilters } from '@/deps.ts';
import * as pipeline from '@/pipeline.ts';
import { activeRelays, pool } from '@/pool.ts';
import { type EventStore, type GetEventsOpts, type StoreEventOpts } from '@/storages/types.ts';

const debug = Debug('ditto:client');

/** Get events from a NIP-01 filter. */
function getEvents<K extends number>(filters: Filter<K>[], opts: GetEventsOpts = {}): Promise<Event<K>[]> {
  if (opts.signal?.aborted) return Promise.resolve([]);
  if (!filters.length) return Promise.resolve([]);
  debug('REQ', JSON.stringify(filters));

  return new Promise((resolve) => {
    const results: Event[] = [];

    const unsub = pool.subscribe(
      filters,
      opts.relays ?? activeRelays,
      (event: Event | null) => {
        if (event && matchFilters(filters, event)) {
          pipeline.handleEvent(event).catch(() => {});
          results.push({
            id: event.id,
            kind: event.kind,
            pubkey: event.pubkey,
            content: event.content,
            tags: event.tags,
            created_at: event.created_at,
            sig: event.sig,
          });
        }
        if (typeof opts.limit === 'number' && results.length >= opts.limit) {
          unsub();
          resolve(results as Event<K>[]);
        }
      },
      undefined,
      () => {
        unsub();
        resolve(results as Event<K>[]);
      },
    );

    opts.signal?.addEventListener('abort', () => {
      unsub();
      resolve(results as Event<K>[]);
    });
  });
}

/** Publish an event to the given relays, or the entire pool. */
function storeEvent(event: Event, opts: StoreEventOpts = {}): Promise<void> {
  const { relays = activeRelays } = opts;
  const debug = Debug('ditto:client:publish');
  debug('EVENT', event);
  pool.publish(event, relays);
  return Promise.resolve();
}

const client: EventStore = {
  supportedNips: [1],
  getEvents,
  storeEvent,
  countEvents: () => Promise.reject(new Error('COUNT not implemented')),
  deleteEvents: () => Promise.reject(new Error('Cannot delete events from relays. Create a kind 5 event instead.')),
};

export { client };

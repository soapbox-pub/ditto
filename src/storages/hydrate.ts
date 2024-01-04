import { type DittoFilter } from '@/filter.ts';
import { type DittoEvent, type EventStore } from '@/storages/types.ts';

interface HydrateEventOpts<K extends number> {
  events: DittoEvent<K>[];
  filters: DittoFilter<K>[];
  storage: EventStore;
  signal?: AbortSignal;
}

/** Hydrate event relationships using the provided storage. */
async function hydrateEvents<K extends number>(opts: HydrateEventOpts<K>): Promise<DittoEvent<K>[]> {
  const { events, filters, storage, signal } = opts;

  if (filters.some((filter) => filter.relations?.includes('author'))) {
    const pubkeys = new Set([...events].map((event) => event.pubkey));
    const authors = await storage.getEvents([{ kinds: [0], authors: [...pubkeys] }], { signal });

    for (const event of events) {
      event.author = authors.find((author) => author.pubkey === event.pubkey);
    }
  }

  return events;
}

export { hydrateEvents };

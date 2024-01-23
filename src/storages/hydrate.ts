import { type NStore } from '@/deps.ts';
import { type DittoEvent } from '@/interfaces/DittoEvent.ts';
import { type DittoFilter } from '@/interfaces/DittoFilter.ts';

interface HydrateEventOpts {
  events: DittoEvent[];
  filters: DittoFilter[];
  storage: NStore;
  signal?: AbortSignal;
}

/** Hydrate event relationships using the provided storage. */
async function hydrateEvents(opts: HydrateEventOpts): Promise<DittoEvent[]> {
  const { events, filters, storage, signal } = opts;

  if (filters.some((filter) => filter.relations?.includes('author'))) {
    const pubkeys = new Set([...events].map((event) => event.pubkey));
    const authors = await storage.query([{ kinds: [0], authors: [...pubkeys] }], { signal });

    for (const event of events) {
      event.author = authors.find((author) => author.pubkey === event.pubkey);
    }
  }

  return events;
}

export { hydrateEvents };

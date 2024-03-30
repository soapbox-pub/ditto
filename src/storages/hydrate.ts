import { type NostrEvent, type NStore } from '@/deps.ts';
import { type DittoEvent } from '@/interfaces/DittoEvent.ts';
import { type DittoRelation } from '@/interfaces/DittoFilter.ts';

interface HydrateEventOpts {
  events: DittoEvent[];
  relations: DittoRelation[];
  storage: NStore;
  signal?: AbortSignal;
}

/** Hydrate event relationships using the provided storage. */
async function hydrateEvents(opts: HydrateEventOpts): Promise<DittoEvent[]> {
  const { events, relations, storage, signal } = opts;

  if (!events.length || !relations.length) {
    return events;
  }

  for (const relation of relations) {
    switch (relation) {
      case 'author':
        await hydrateAuthors({ events, storage, signal });
        break;
    }
  }

  return events;
}

async function hydrateAuthors(opts: Omit<HydrateEventOpts, 'relations'>): Promise<DittoEvent[]> {
  const { events, storage, signal } = opts;

  const pubkeys = new Set([...events].map((event) => event.pubkey));
  const authors = await storage.query([{ kinds: [0], authors: [...pubkeys], limit: pubkeys.size }], { signal });

  for (const event of events) {
    event.author = authors.find((author) => author.pubkey === event.pubkey);
  }

  return events;
}

/** Return a normalized event without any non-standard keys. */
function purifyEvent(event: NostrEvent): NostrEvent {
  return {
    id: event.id,
    pubkey: event.pubkey,
    kind: event.kind,
    content: event.content,
    tags: event.tags,
    sig: event.sig,
    created_at: event.created_at,
  };
}

export { hydrateEvents, purifyEvent };

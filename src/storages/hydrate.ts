import { NostrEvent, NStore } from '@nostrify/nostrify';

import { db } from '@/db.ts';
import { type DittoEvent } from '@/interfaces/DittoEvent.ts';
import { DittoTables } from '@/db/DittoTables.ts';
import { Conf } from '@/config.ts';

interface HydrateOpts {
  events: DittoEvent[];
  storage: NStore;
  signal?: AbortSignal;
}

/** Hydrate events using the provided storage. */
async function hydrateEvents(opts: HydrateOpts): Promise<DittoEvent[]> {
  const { events, storage, signal } = opts;

  if (!events.length) {
    return events;
  }

  const cache = [...events];

  for (const event of await gatherReposts({ events, storage, signal })) {
    cache.push(event);
  }

  for (const event of await gatherQuotes({ events, storage, signal })) {
    cache.push(event);
  }

  for (const event of await gatherAuthors({ events, storage, signal })) {
    cache.push(event);
  }

  for (const event of await gatherUsers({ events, storage, signal })) {
    cache.push(event);
  }

  const stats = {
    authors: await gatherAuthorStats(cache),
    events: await gatherEventStats(cache),
  };

  assembleEvents(cache, cache, stats);
  assembleEvents(events, cache, stats);

  return events;
}

function assembleEvents(
  a: DittoEvent[],
  b: DittoEvent[],
  stats: { authors: DittoTables['author_stats'][]; events: DittoTables['event_stats'][] },
): DittoEvent[] {
  const admin = Conf.pubkey;

  for (const event of a) {
    if (event.kind === 6) {
      const id = event.tags.find(([name]) => name === 'e')?.[1];
      event.repost = b.find((e) => e.kind === 1 && id === e.id);
    }

    if (event.kind === 1) {
      const id = event.tags.find(([name]) => name === 'q')?.[1];
      event.quote_repost = b.find((e) => e.kind === 1 && id === e.id);
    }

    event.author = b.find((e) => e.kind === 0 && e.pubkey === event.pubkey);
    event.author_stats = stats.authors.find((stats) => stats.pubkey === event.pubkey);
    event.event_stats = stats.events.find((stats) => stats.event_id === event.id);

    event.user = b.find((e) =>
      e.kind === 30361 && e.pubkey === admin && e.tags.find(([name]) => name === 'd')?.[1] === event.pubkey
    );
  }

  return a;
}

function gatherReposts({ events, storage, signal }: HydrateOpts): Promise<DittoEvent[]> {
  const ids = new Set<string>();

  for (const event of events) {
    if (event.kind === 6) {
      const id = event.tags.find(([name]) => name === 'e')?.[1];
      if (id) {
        ids.add(id);
      }
    }
  }

  return storage.query(
    [{ ids: [...ids], limit: ids.size }],
    { signal },
  );
}

function gatherQuotes({ events, storage, signal }: HydrateOpts): Promise<DittoEvent[]> {
  const ids = new Set<string>();

  for (const event of events) {
    if (event.kind === 1) {
      const id = event.tags.find(([name]) => name === 'q')?.[1];
      if (id) {
        ids.add(id);
      }
    }
  }

  return storage.query(
    [{ ids: [...ids], limit: ids.size }],
    { signal },
  );
}

function gatherAuthors({ events, storage, signal }: HydrateOpts): Promise<DittoEvent[]> {
  const pubkeys = new Set(events.map((event) => event.pubkey));

  return storage.query(
    [{ kinds: [0], authors: [...pubkeys], limit: pubkeys.size }],
    { signal },
  );
}

function gatherUsers({ events, storage, signal }: HydrateOpts): Promise<DittoEvent[]> {
  const pubkeys = new Set(events.map((event) => event.pubkey));

  return storage.query(
    [{ kinds: [30361], authors: [Conf.pubkey], '#d': [...pubkeys], limit: pubkeys.size }],
    { signal },
  );
}

function gatherAuthorStats(events: DittoEvent[]): Promise<DittoTables['author_stats'][]> {
  const pubkeys = new Set<string>(
    events
      .filter((event) => event.kind === 0)
      .map((event) => event.pubkey),
  );

  return db
    .selectFrom('author_stats')
    .selectAll()
    .where('pubkey', 'in', [...pubkeys])
    .execute();
}

function gatherEventStats(events: DittoEvent[]): Promise<DittoTables['event_stats'][]> {
  const ids = new Set<string>(
    events
      .filter((event) => event.kind === 1)
      .map((event) => event.id),
  );

  return db
    .selectFrom('event_stats')
    .selectAll()
    .where('event_id', 'in', [...ids])
    .execute();
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

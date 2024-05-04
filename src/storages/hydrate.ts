import { NostrEvent, NStore } from '@nostrify/nostrify';
import { matchFilter } from 'nostr-tools';

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

  for (const event of await gatherReposts({ events: cache, storage, signal })) {
    cache.push(event);
  }

  for (const event of await gatherReacted({ events: cache, storage, signal })) {
    cache.push(event);
  }

  for (const event of await gatherQuotes({ events: cache, storage, signal })) {
    cache.push(event);
  }

  for (const event of await gatherAuthors({ events: cache, storage, signal })) {
    cache.push(event);
  }

  for (const event of await gatherUsers({ events: cache, storage, signal })) {
    cache.push(event);
  }

  for (const event of await gatherTargetAccounts({ events: cache, storage, signal })) {
    cache.push(event);
  }

  for (const event of await gatherReportedStatuses({ events: cache, storage, signal })) {
    cache.push(event);
  }

  const stats = {
    authors: await gatherAuthorStats(cache),
    events: await gatherEventStats(cache),
  };

  // Dedupe events.
  const results = [...new Map(cache.map((event) => [event.id, event])).values()];

  // First connect all the events to each-other, then connect the connected events to the original list.
  assembleEvents(results, results, stats);
  assembleEvents(events, results, stats);

  return events;
}

/** Connect the events in list `b` to the DittoEvent fields in list `a`. */
function assembleEvents(
  a: DittoEvent[],
  b: DittoEvent[],
  stats: { authors: DittoTables['author_stats'][]; events: DittoTables['event_stats'][] },
): DittoEvent[] {
  const admin = Conf.pubkey;

  for (const event of a) {
    event.author = b.find((e) => matchFilter({ kinds: [0], authors: [event.pubkey] }, e));
    event.user = b.find((e) => matchFilter({ kinds: [30361], authors: [admin], '#d': [event.pubkey] }, e));

    if (event.kind === 1) {
      const id = event.tags.find(([name]) => name === 'q')?.[1];
      if (id) {
        event.quote_repost = b.find((e) => matchFilter({ kinds: [1], ids: [id] }, e));
      }
    }

    if (event.kind === 6) {
      const id = event.tags.find(([name]) => name === 'e')?.[1];
      if (id) {
        event.repost = b.find((e) => matchFilter({ kinds: [1], ids: [id] }, e));
      }
    }

    if (event.kind === 1984) {
      const targetAccountId = event.tags.find(([name]) => name === 'p')?.[1];
      if (targetAccountId) {
        event.target_account = b.find((e) => matchFilter({ kinds: [0], authors: [targetAccountId] }, e));
        if (event.target_account) {
          event.target_account.user = b.find((e) =>
            matchFilter({ kinds: [30361], authors: [admin], '#d': [event.pubkey] }, e)
          );
        }
      }
      const reportedEvents: DittoEvent[] = [];

      const { status_ids } = JSON.parse(event.content);
      if (status_ids && Array.isArray(status_ids)) {
        for (const id of status_ids) {
          if (typeof id === 'string') {
            const reportedEvent = b.find((e) => matchFilter({ kinds: [1], ids: [id] }, e));
            if (reportedEvent) reportedEvents.push(reportedEvent);
          }
        }
        event.reported_statuses = reportedEvents;
      }
    }

    event.author_stats = stats.authors.find((stats) => stats.pubkey === event.pubkey);
    event.event_stats = stats.events.find((stats) => stats.event_id === event.id);
  }

  return a;
}

/** Collect reposts from the events. */
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

/** Collect events being reacted to by the events. */
function gatherReacted({ events, storage, signal }: HydrateOpts): Promise<DittoEvent[]> {
  const ids = new Set<string>();

  for (const event of events) {
    if (event.kind === 7) {
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

/** Collect quotes from the events. */
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

/** Collect authors from the events. */
function gatherAuthors({ events, storage, signal }: HydrateOpts): Promise<DittoEvent[]> {
  const pubkeys = new Set(events.map((event) => event.pubkey));

  return storage.query(
    [{ kinds: [0], authors: [...pubkeys], limit: pubkeys.size }],
    { signal },
  );
}

/** Collect users from the events. */
function gatherUsers({ events, storage, signal }: HydrateOpts): Promise<DittoEvent[]> {
  const pubkeys = new Set(events.map((event) => event.pubkey));

  return storage.query(
    [{ kinds: [30361], authors: [Conf.pubkey], '#d': [...pubkeys], limit: pubkeys.size }],
    { signal },
  );
}

/** Collect reported statuses from the events. */
function gatherReportedStatuses({ events, storage, signal }: HydrateOpts): Promise<DittoEvent[]> {
  const ids = new Set<string>();
  for (const event of events) {
    if (event.kind === 1984) {
      const { status_ids } = JSON.parse(event.content);
      if (status_ids && Array.isArray(status_ids)) {
        for (const id of status_ids) {
          if (typeof id === 'string') ids.add(id);
        }
      }
    }
  }

  return storage.query(
    [{ kinds: [1], ids: [...ids], limit: ids.size }],
    { signal },
  );
}

/** Collect target accounts (the ones being reported) from the events. */
function gatherTargetAccounts({ events, storage, signal }: HydrateOpts): Promise<DittoEvent[]> {
  const pubkeys = new Set<string>();

  for (const event of events) {
    if (event.kind === 1984) {
      const pubkey = event.tags.find(([name]) => name === 'p')?.[1];
      if (pubkey) {
        pubkeys.add(pubkey);
      }
    }
  }

  return storage.query(
    [{ kinds: [0], authors: [...pubkeys], limit: pubkeys.size }],
    { signal },
  );
}

/** Collect author stats from the events. */
function gatherAuthorStats(events: DittoEvent[]): Promise<DittoTables['author_stats'][]> {
  const pubkeys = new Set<string>(
    events
      .filter((event) => event.kind === 0)
      .map((event) => event.pubkey),
  );

  if (!pubkeys.size) {
    return Promise.resolve([]);
  }

  return db
    .selectFrom('author_stats')
    .selectAll()
    .where('pubkey', 'in', [...pubkeys])
    .execute();
}

/** Collect event stats from the events. */
function gatherEventStats(events: DittoEvent[]): Promise<DittoTables['event_stats'][]> {
  const ids = new Set<string>(
    events
      .filter((event) => event.kind === 1)
      .map((event) => event.id),
  );

  if (!ids.size) {
    return Promise.resolve([]);
  }

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

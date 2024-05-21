import { NostrEvent, NStore } from '@nostrify/nostrify';
import { matchFilter } from 'nostr-tools';

import { DittoDB } from '@/db/DittoDB.ts';
import { type DittoEvent } from '@/interfaces/DittoEvent.ts';
import { DittoTables } from '@/db/DittoTables.ts';
import { Conf } from '@/config.ts';
import { refreshAuthorStatsDebounced } from '@/stats.ts';
import { findQuoteTag } from '@/utils/tags.ts';

interface HydrateOpts {
  events: DittoEvent[];
  store: NStore;
  signal?: AbortSignal;
}

/** Hydrate events using the provided storage. */
async function hydrateEvents(opts: HydrateOpts): Promise<DittoEvent[]> {
  const { events, store, signal } = opts;

  if (!events.length) {
    return events;
  }

  const cache = [...events];

  for (const event of await gatherReposts({ events: cache, store, signal })) {
    cache.push(event);
  }

  for (const event of await gatherReacted({ events: cache, store, signal })) {
    cache.push(event);
  }

  for (const event of await gatherQuotes({ events: cache, store, signal })) {
    cache.push(event);
  }

  for (const event of await gatherAuthors({ events: cache, store, signal })) {
    cache.push(event);
  }

  for (const event of await gatherUsers({ events: cache, store, signal })) {
    cache.push(event);
  }

  for (const event of await gatherReportedProfiles({ events: cache, store, signal })) {
    cache.push(event);
  }

  for (const event of await gatherReportedNotes({ events: cache, store, signal })) {
    cache.push(event);
  }

  const stats = {
    authors: await gatherAuthorStats(cache),
    events: await gatherEventStats(cache),
  };

  refreshMissingAuthorStats(events, stats.authors);

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
      const id = findQuoteTag(event.tags)?.[1];
      if (id) {
        event.quote = b.find((e) => matchFilter({ kinds: [1], ids: [id] }, e));
      }
    }

    if (event.kind === 6) {
      const id = event.tags.find(([name]) => name === 'e')?.[1];
      if (id) {
        event.repost = b.find((e) => matchFilter({ kinds: [1], ids: [id] }, e));
      }
    }

    if (event.kind === 7) {
      const id = event.tags.find(([name]) => name === 'e')?.[1];
      if (id) {
        event.reacted = b.find((e) => matchFilter({ kinds: [1], ids: [id] }, e));
      }
    }

    if (event.kind === 1984) {
      const targetAccountId = event.tags.find(([name]) => name === 'p')?.[1];
      if (targetAccountId) {
        event.reported_profile = b.find((e) => matchFilter({ kinds: [0], authors: [targetAccountId] }, e));
      }
      const reportedEvents: DittoEvent[] = [];

      const status_ids = event.tags.filter(([name]) => name === 'e').map((tag) => tag[1]);
      if (status_ids.length > 0) {
        for (const id of status_ids) {
          const reportedEvent = b.find((e) => matchFilter({ kinds: [1], ids: [id] }, e));
          if (reportedEvent) reportedEvents.push(reportedEvent);
        }
        event.reported_notes = reportedEvents;
      }
    }

    event.author_stats = stats.authors.find((stats) => stats.pubkey === event.pubkey);
    event.event_stats = stats.events.find((stats) => stats.event_id === event.id);
  }

  return a;
}

/** Collect reposts from the events. */
function gatherReposts({ events, store, signal }: HydrateOpts): Promise<DittoEvent[]> {
  const ids = new Set<string>();

  for (const event of events) {
    if (event.kind === 6) {
      const id = event.tags.find(([name]) => name === 'e')?.[1];
      if (id) {
        ids.add(id);
      }
    }
  }

  return store.query(
    [{ ids: [...ids], limit: ids.size }],
    { signal },
  );
}

/** Collect events being reacted to by the events. */
function gatherReacted({ events, store, signal }: HydrateOpts): Promise<DittoEvent[]> {
  const ids = new Set<string>();

  for (const event of events) {
    if (event.kind === 7) {
      const id = event.tags.find(([name]) => name === 'e')?.[1];
      if (id) {
        ids.add(id);
      }
    }
  }

  return store.query(
    [{ ids: [...ids], limit: ids.size }],
    { signal },
  );
}

/** Collect quotes from the events. */
function gatherQuotes({ events, store, signal }: HydrateOpts): Promise<DittoEvent[]> {
  const ids = new Set<string>();

  for (const event of events) {
    if (event.kind === 1) {
      const id = findQuoteTag(event.tags)?.[1];
      if (id) {
        ids.add(id);
      }
    }
  }

  return store.query(
    [{ ids: [...ids], limit: ids.size }],
    { signal },
  );
}

/** Collect authors from the events. */
function gatherAuthors({ events, store, signal }: HydrateOpts): Promise<DittoEvent[]> {
  const pubkeys = new Set(events.map((event) => event.pubkey));

  return store.query(
    [{ kinds: [0], authors: [...pubkeys], limit: pubkeys.size }],
    { signal },
  );
}

/** Collect users from the events. */
function gatherUsers({ events, store, signal }: HydrateOpts): Promise<DittoEvent[]> {
  const pubkeys = new Set(events.map((event) => event.pubkey));

  return store.query(
    [{ kinds: [30361], authors: [Conf.pubkey], '#d': [...pubkeys], limit: pubkeys.size }],
    { signal },
  );
}

/** Collect reported notes from the events. */
function gatherReportedNotes({ events, store, signal }: HydrateOpts): Promise<DittoEvent[]> {
  const ids = new Set<string>();
  for (const event of events) {
    if (event.kind === 1984) {
      const status_ids = event.tags.filter(([name]) => name === 'e').map((tag) => tag[1]);
      if (status_ids.length > 0) {
        for (const id of status_ids) {
          ids.add(id);
        }
      }
    }
  }

  return store.query(
    [{ kinds: [1], ids: [...ids], limit: ids.size }],
    { signal },
  );
}

/** Collect reported profiles from the events. */
function gatherReportedProfiles({ events, store, signal }: HydrateOpts): Promise<DittoEvent[]> {
  const pubkeys = new Set<string>();

  for (const event of events) {
    if (event.kind === 1984) {
      const pubkey = event.tags.find(([name]) => name === 'p')?.[1];
      if (pubkey) {
        pubkeys.add(pubkey);
      }
    }
  }

  return store.query(
    [{ kinds: [0], authors: [...pubkeys], limit: pubkeys.size }],
    { signal },
  );
}

/** Collect author stats from the events. */
async function gatherAuthorStats(events: DittoEvent[]): Promise<DittoTables['author_stats'][]> {
  const pubkeys = new Set<string>(
    events
      .filter((event) => event.kind === 0)
      .map((event) => event.pubkey),
  );

  if (!pubkeys.size) {
    return Promise.resolve([]);
  }

  const kysely = await DittoDB.getInstance();

  const rows = await kysely
    .selectFrom('author_stats')
    .selectAll()
    .where('pubkey', 'in', [...pubkeys])
    .execute();

  return rows.map((row) => ({
    pubkey: row.pubkey,
    followers_count: Math.max(0, row.followers_count),
    following_count: Math.max(0, row.following_count),
    notes_count: Math.max(0, row.notes_count),
  }));
}

function refreshMissingAuthorStats(events: NostrEvent[], stats: DittoTables['author_stats'][]) {
  const pubkeys = new Set<string>(
    events
      .filter((event) => event.kind === 0)
      .map((event) => event.pubkey),
  );

  const missing = pubkeys.difference(
    new Set(stats.map((stat) => stat.pubkey)),
  );

  for (const pubkey of missing) {
    refreshAuthorStatsDebounced(pubkey);
  }
}

/** Collect event stats from the events. */
async function gatherEventStats(events: DittoEvent[]): Promise<DittoTables['event_stats'][]> {
  const ids = new Set<string>(
    events
      .filter((event) => event.kind === 1)
      .map((event) => event.id),
  );

  if (!ids.size) {
    return Promise.resolve([]);
  }

  const kysely = await DittoDB.getInstance();

  const rows = await kysely
    .selectFrom('event_stats')
    .selectAll()
    .where('event_id', 'in', [...ids])
    .execute();

  return rows.map((row) => ({
    event_id: row.event_id,
    reposts_count: Math.max(0, row.reposts_count),
    reactions_count: Math.max(0, row.reactions_count),
    replies_count: Math.max(0, row.replies_count),
  }));
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

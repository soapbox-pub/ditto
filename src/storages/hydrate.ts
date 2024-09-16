import { NStore } from '@nostrify/nostrify';
import { Kysely } from 'kysely';
import { matchFilter } from 'nostr-tools';
import { NSchema as n } from '@nostrify/nostrify';
import { z } from 'zod';

import { DittoTables } from '@/db/DittoTables.ts';
import { Conf } from '@/config.ts';
import { type DittoEvent } from '@/interfaces/DittoEvent.ts';
import { findQuoteTag } from '@/utils/tags.ts';
import { findQuoteInContent } from '@/utils/note.ts';
import { getAmount } from '@/utils/bolt11.ts';
import { Storages } from '@/storages.ts';

interface HydrateOpts {
  events: DittoEvent[];
  store: NStore;
  signal?: AbortSignal;
  kysely?: Kysely<DittoTables>;
}

/** Hydrate events using the provided storage. */
async function hydrateEvents(opts: HydrateOpts): Promise<DittoEvent[]> {
  const { events, store, signal, kysely = await Storages.kysely() } = opts;

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

  for (const event of await gatherInfo({ events: cache, store, signal })) {
    cache.push(event);
  }

  for (const event of await gatherReportedProfiles({ events: cache, store, signal })) {
    cache.push(event);
  }

  for (const event of await gatherReportedNotes({ events: cache, store, signal })) {
    cache.push(event);
  }

  for (const event of await gatherZapped({ events: cache, store, signal })) {
    cache.push(event);
  }

  for (const event of await gatherZapSender({ events: cache, store, signal })) {
    cache.push(event);
  }

  const stats = {
    authors: await gatherAuthorStats(cache, kysely as Kysely<DittoTables>),
    events: await gatherEventStats(cache, kysely as Kysely<DittoTables>),
  };

  // Dedupe events.
  const results = [...new Map(cache.map((event) => [event.id, event])).values()];

  // First connect all the events to each-other, then connect the connected events to the original list.
  assembleEvents(results, results, stats);
  assembleEvents(events, results, stats);

  return events;
}

/** Connect the events in list `b` to the DittoEvent fields in list `a`. */
export function assembleEvents(
  a: DittoEvent[],
  b: DittoEvent[],
  stats: { authors: DittoTables['author_stats'][]; events: DittoTables['event_stats'][] },
): DittoEvent[] {
  const admin = Conf.pubkey;

  const eventStats = stats.events.map((stat) => ({
    ...stat,
    reactions: JSON.parse(stat.reactions),
  }));

  for (const event of a) {
    event.author = b.find((e) => matchFilter({ kinds: [0], authors: [event.pubkey] }, e));
    event.user = b.find((e) => matchFilter({ kinds: [30382], authors: [admin], '#d': [event.pubkey] }, e));
    event.info = b.find((e) => matchFilter({ kinds: [30383], authors: [admin], '#d': [event.id] }, e));

    if (event.kind === 1) {
      const id = findQuoteTag(event.tags)?.[1] || findQuoteInContent(event.content);
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
      const id = event.tags.findLast(([name]) => name === 'e')?.[1];
      if (id) {
        event.reacted = b.find((e) => matchFilter({ kinds: [1], ids: [id] }, e));
      }
    }

    if (event.kind === 1984) {
      const pubkey = event.tags.find(([name]) => name === 'p')?.[1];
      if (pubkey) {
        event.reported_profile = b.find((e) => matchFilter({ kinds: [0], authors: [pubkey] }, e));
      }

      const reportedEvents: DittoEvent[] = [];
      const ids = event.tags.filter(([name]) => name === 'e').map(([_name, value]) => value);

      for (const id of ids) {
        const reported = b.find((e) => matchFilter({ kinds: [1], ids: [id] }, e));
        if (reported) {
          reportedEvents.push(reported);
        }
      }
      event.reported_notes = reportedEvents;
    }

    if (event.kind === 9735) {
      const amountSchema = z.coerce.number().int().nonnegative().catch(0);
      // amount in millisats
      const amount = amountSchema.parse(getAmount(event?.tags.find(([name]) => name === 'bolt11')?.[1]));
      event.zap_amount = amount;

      const id = event.tags.find(([name]) => name === 'e')?.[1];
      if (id) {
        event.zapped = b.find((e) => matchFilter({ kinds: [1], ids: [id] }, e));
      }

      const zapRequestString = event?.tags?.find(([name]) => name === 'description')?.[1];
      const zapRequest = n.json().pipe(n.event()).optional().catch(undefined).parse(zapRequestString);
      // By getting the pubkey from the zap request we guarantee who is the sender
      // some clients don't put the P tag in the zap receipt...
      const zapSender = zapRequest?.pubkey;
      if (zapSender) {
        event.zap_sender = b.find((e) => matchFilter({ kinds: [0], authors: [zapSender] }, e)) ?? zapSender;
      }
    }

    event.author_stats = stats.authors.find((stats) => stats.pubkey === event.pubkey);
    event.event_stats = eventStats.find((stats) => stats.event_id === event.id);
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
      const id = event.tags.findLast(([name]) => name === 'e')?.[1];
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
      const id = findQuoteTag(event.tags)?.[1] || findQuoteInContent(event.content);
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

  if (!pubkeys.size) {
    return Promise.resolve([]);
  }

  return store.query(
    [{ kinds: [30382], authors: [Conf.pubkey], '#d': [...pubkeys], limit: pubkeys.size }],
    { signal },
  );
}

/** Collect info events from the events. */
function gatherInfo({ events, store, signal }: HydrateOpts): Promise<DittoEvent[]> {
  const ids = new Set<string>();

  for (const event of events) {
    if (event.kind === 1984 || event.kind === 3036) {
      ids.add(event.id);
    }
  }

  if (!ids.size) {
    return Promise.resolve([]);
  }

  return store.query(
    [{ kinds: [30383], authors: [Conf.pubkey], '#d': [...ids], limit: ids.size }],
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

/** Collect events being zapped. */
function gatherZapped({ events, store, signal }: HydrateOpts): Promise<DittoEvent[]> {
  const ids = new Set<string>();

  for (const event of events) {
    if (event.kind === 9735) {
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

/** Collect author that zapped. */
function gatherZapSender({ events, store, signal }: HydrateOpts): Promise<DittoEvent[]> {
  const pubkeys = new Set<string>();

  for (const event of events) {
    if (event.kind === 9735) {
      const zapRequestString = event?.tags?.find(([name]) => name === 'description')?.[1];
      const zapRequest = n.json().pipe(n.event()).optional().catch(undefined).parse(zapRequestString);
      // By getting the pubkey from the zap request we guarantee who is the sender
      // some clients don't put the P tag in the zap receipt...
      const zapSender = zapRequest?.pubkey;
      if (zapSender) {
        pubkeys.add(zapSender);
      }
    }
  }

  return store.query(
    [{ kinds: [0], limit: pubkeys.size }],
    { signal },
  );
}

/** Collect author stats from the events. */
async function gatherAuthorStats(
  events: DittoEvent[],
  kysely: Kysely<DittoTables>,
): Promise<DittoTables['author_stats'][]> {
  const pubkeys = new Set<string>(
    events
      .filter((event) => event.kind === 0)
      .map((event) => event.pubkey),
  );

  if (!pubkeys.size) {
    return Promise.resolve([]);
  }

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

/** Collect event stats from the events. */
async function gatherEventStats(
  events: DittoEvent[],
  kysely: Kysely<DittoTables>,
): Promise<DittoTables['event_stats'][]> {
  const ids = new Set<string>(
    events
      .filter((event) => event.kind === 1)
      .map((event) => event.id),
  );

  if (!ids.size) {
    return Promise.resolve([]);
  }

  const rows = await kysely
    .selectFrom('event_stats')
    .selectAll()
    .where('event_id', 'in', [...ids])
    .execute();

  return rows.map((row) => ({
    event_id: row.event_id,
    reposts_count: Math.max(0, row.reposts_count),
    replies_count: Math.max(0, row.replies_count),
    reactions_count: Math.max(0, row.reactions_count),
    quotes_count: Math.max(0, row.quotes_count),
    reactions: row.reactions,
    zaps_amount: Math.max(0, row.zaps_amount),
  }));
}

export { hydrateEvents };

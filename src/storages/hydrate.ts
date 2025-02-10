import { NStore } from '@nostrify/nostrify';
import { Kysely } from 'kysely';
import { matchFilter } from 'nostr-tools';
import { NSchema as n } from '@nostrify/nostrify';
import { z } from 'zod';

import { DittoTables } from '@/db/DittoTables.ts';
import { Conf } from '@/config.ts';
import { type DittoEvent } from '@/interfaces/DittoEvent.ts';
import { fallbackAuthor } from '@/utils.ts';
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

  for (const event of await gatherRelatedEvents({ events: cache, store, signal })) {
    cache.push(event);
  }

  for (const event of await gatherQuotes({ events: cache, store, signal })) {
    cache.push(event);
  }

  for (const event of await gatherProfiles({ events: cache, store, signal })) {
    cache.push(event);
  }

  for (const event of await gatherUsers({ events: cache, store, signal })) {
    cache.push(event);
  }

  for (const event of await gatherInfo({ events: cache, store, signal })) {
    cache.push(event);
  }

  const authorStats = await gatherAuthorStats(cache, kysely as Kysely<DittoTables>);
  const eventStats = await gatherEventStats(cache, kysely as Kysely<DittoTables>);

  const domains = authorStats.reduce((result, { nip05_hostname }) => {
    if (nip05_hostname) result.add(nip05_hostname);
    return result;
  }, new Set<string>());

  const favicons = (
    await kysely
      .selectFrom('domain_favicons')
      .select(['domain', 'favicon'])
      .where('domain', 'in', [...domains])
      .execute()
  )
    .reduce((result, { domain, favicon }) => {
      result[domain] = favicon;
      return result;
    }, {} as Record<string, string>);

  const stats = {
    authors: authorStats,
    events: eventStats,
    favicons,
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
  stats: {
    authors: DittoTables['author_stats'][];
    events: DittoTables['event_stats'][];
    favicons: Record<string, string>;
  },
): DittoEvent[] {
  const admin = Conf.pubkey;

  const authorStats = stats.authors.reduce((result, { pubkey, ...stat }) => {
    result[pubkey] = {
      ...stat,
      streak_start: stat.streak_start ?? undefined,
      streak_end: stat.streak_end ?? undefined,
      nip05: stat.nip05 ?? undefined,
      nip05_domain: stat.nip05_domain ?? undefined,
      nip05_hostname: stat.nip05_hostname ?? undefined,
      nip05_last_verified_at: stat.nip05_last_verified_at ?? undefined,
      favicon: stats.favicons[stat.nip05_hostname!],
    };
    return result;
  }, {} as Record<string, DittoEvent['author_stats']>);

  const eventStats = stats.events.reduce((result, { event_id, ...stat }) => {
    result[event_id] = {
      ...stat,
      reactions: JSON.parse(stat.reactions),
    };
    return result;
  }, {} as Record<string, DittoEvent['event_stats']>);

  for (const event of a) {
    event.author = b.find((e) => matchFilter({ kinds: [0], authors: [event.pubkey] }, e));
    event.user = b.find((e) => matchFilter({ kinds: [30382], authors: [admin], '#d': [event.pubkey] }, e));
    event.info = b.find((e) => matchFilter({ kinds: [30383], authors: [admin], '#d': [event.id] }, e));

    if (event.kind === 1) {
      const id = findQuoteTag(event.tags)?.[1] || findQuoteInContent(event.content);
      if (id) {
        event.quote = b.find((e) => matchFilter({ kinds: [1, 20], ids: [id] }, e));
      }

      const pubkeys = event.tags.filter(([name]) => name === 'p').map(([_name, value]) => value);
      event.mentions = b.filter((e) => matchFilter({ kinds: [0], authors: pubkeys }, e));
    }

    if (event.kind === 6) {
      const id = event.tags.find(([name]) => name === 'e')?.[1];
      if (id) {
        event.repost = b.find((e) => matchFilter({ kinds: [1, 20], ids: [id] }, e));
      }
    }

    if (event.kind === 7) {
      const id = event.tags.findLast(([name]) => name === 'e')?.[1];
      if (id) {
        event.reacted = b.find((e) => matchFilter({ kinds: [1, 20], ids: [id] }, e));
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
        const reported = b.find((e) => matchFilter({ kinds: [1, 20], ids: [id] }, e));
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
        event.zapped = b.find((e) => matchFilter({ kinds: [1, 20], ids: [id] }, e));
      }

      const zapRequestString = event?.tags?.find(([name]) => name === 'description')?.[1];
      const zapRequest = n.json().pipe(n.event()).optional().catch(undefined).parse(zapRequestString);
      // By getting the pubkey from the zap request we guarantee who is the sender
      // some clients don't put the P tag in the zap receipt...
      const zapSender = zapRequest?.pubkey;
      if (zapSender) {
        event.zap_sender = b.find((e) => matchFilter({ kinds: [0], authors: [zapSender] }, e)) ?? zapSender;
      }

      event.zap_message = zapRequest?.content ?? '';
    }

    event.author_stats = authorStats[event.pubkey];
    event.event_stats = eventStats[event.id];
  }

  return a;
}

/** Collect event targets (eg reposts, quote posts, reacted posts, etc.) */
function gatherRelatedEvents({ events, store, signal }: HydrateOpts): Promise<DittoEvent[]> {
  const ids = new Set<string>();

  for (const event of events) {
    // Reposted events
    if (event.kind === 6) {
      const id = event.tags.find(([name]) => name === 'e')?.[1];
      if (id) {
        ids.add(id);
      }
    }
    // Reacted events
    if (event.kind === 7) {
      const id = event.tags.findLast(([name]) => name === 'e')?.[1];
      if (id) {
        ids.add(id);
      }
    }
    // Reported events
    if (event.kind === 1984) {
      for (const [name, value] of event.tags) {
        if (name === 'e') {
          ids.add(value);
        }
      }
    }
    // Zapped events
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

/** Collect profiles from the events. */
async function gatherProfiles({ events, store, signal }: HydrateOpts): Promise<DittoEvent[]> {
  const pubkeys = new Set<string>();

  for (const event of events) {
    // Authors
    pubkeys.add(event.pubkey);

    // Mentions
    if (event.kind === 1) {
      for (const [name, value] of event.tags) {
        if (name === 'p') {
          pubkeys.add(value);
        }
      }
    }
    // Reported profiles
    if (event.kind === 1984) {
      const pubkey = event.tags.find(([name]) => name === 'p')?.[1];
      if (pubkey) {
        pubkeys.add(pubkey);
      }
    }
    // Zap recipients
    if (event.kind === 9735) {
      const zapReceiver = event.tags.find(([name]) => name === 'p')?.[1];
      if (zapReceiver) {
        pubkeys.add(zapReceiver);
      }

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

  const authors = await store.query(
    [{ kinds: [0], authors: [...pubkeys], limit: pubkeys.size }],
    { signal },
  );

  for (const pubkey of pubkeys) {
    const author = authors.find((e) => matchFilter({ kinds: [0], authors: [pubkey] }, e));
    if (!author) {
      const fallback = fallbackAuthor(pubkey);
      authors.push(fallback);
    }
  }

  return authors;
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
    ...row,
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

import { DittoDB, DittoTables } from '@ditto/db';
import { DittoConf } from '@ditto/conf';
import { type NostrFilter, NStore } from '@nostrify/nostrify';
import { Kysely } from 'kysely';
import { matchFilter } from 'nostr-tools';
import { NSchema as n } from '@nostrify/nostrify';
import { z } from 'zod';

import { type DittoEvent } from '@/interfaces/DittoEvent.ts';
import { fallbackAuthor, isNostrId } from '@/utils.ts';
import { findQuoteTag } from '@/utils/tags.ts';
import { findQuoteInContent } from '@/utils/note.ts';
import { getAmount } from '@/utils/bolt11.ts';

interface HydrateOpts {
  db: DittoDB;
  conf: DittoConf;
  relay: NStore;
  events: DittoEvent[];
  signal?: AbortSignal;
}

/** Hydrate events using the provided storage. */
async function hydrateEvents(opts: HydrateOpts): Promise<DittoEvent[]> {
  const { conf, db, events } = opts;

  if (!events.length) {
    return events;
  }

  const cache = [...events];

  for (const event of await gatherRelatedEvents({ ...opts, events: cache })) {
    cache.push(event);
  }

  for (const event of await gatherQuotes({ ...opts, events: cache })) {
    cache.push(event);
  }

  for (const event of await gatherProfiles({ ...opts, events: cache })) {
    cache.push(event);
  }

  for (const event of await gatherUsers({ ...opts, events: cache })) {
    cache.push(event);
  }

  for (const event of await gatherInfo({ ...opts, events: cache })) {
    cache.push(event);
  }

  for (const event of await gatherAcceptCashu({ ...opts, events: cache })) {
    cache.push(event);
  }

  for (const event of await gatherClients({ ...opts, events: cache })) {
    cache.push(event);
  }

  const authorStats = await gatherAuthorStats(cache, db.kysely);
  const eventStats = await gatherEventStats(cache, db.kysely);

  const domains = authorStats.reduce((result, { nip05_hostname }) => {
    if (nip05_hostname) result.add(nip05_hostname);
    return result;
  }, new Set<string>());

  const favicons: Record<string, string> = domains.size
    ? (
      await db.kysely
        .selectFrom('domain_favicons')
        .select(['domain', 'favicon'])
        .where('domain', 'in', [...domains])
        .execute()
    )
      .reduce((result, { domain, favicon }) => {
        result[domain] = favicon;
        return result;
      }, {} as Record<string, string>)
    : {};

  const stats = {
    authors: authorStats,
    events: eventStats,
    favicons,
  };

  // Dedupe events.
  const results = [...new Map(cache.map((event) => [event.id, event])).values()];

  const admin = await conf.signer.getPublicKey();

  // First connect all the events to each-other, then connect the connected events to the original list.
  assembleEvents(admin, results, results, stats);
  assembleEvents(admin, events, results, stats);

  return events;
}

/** Connect the events in list `b` to the DittoEvent fields in list `a`. */
export function assembleEvents(
  admin: string,
  a: DittoEvent[],
  b: DittoEvent[],
  stats: {
    authors: DittoTables['author_stats'][];
    events: DittoTables['event_stats'][];
    favicons: Record<string, string>;
  },
): DittoEvent[] {
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

    for (const [name, _value, addr] of event.tags) {
      if (name === 'client' && addr) {
        const match = addr.match(/^31990:([0-9a-f]{64}):(.+)$/);
        if (match) {
          const [, pubkey, d] = match;
          event.client = b.find((e) => matchFilter({ kinds: [31990], authors: [pubkey], '#d': [d] }, e));
        }
      }
    }

    if (event.kind === 1) {
      const id = findQuoteTag(event.tags)?.[1] || findQuoteInContent(event.content);
      if (id) {
        event.quote = b.find((e) => matchFilter({ kinds: [1, 20], ids: [id] }, e));
      }

      const pubkeys = event.tags.filter(([name, value]) => name === 'p' && isNostrId(value))
        .map(([_name, value]) => value);
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

    event.accepts_zaps_cashu = b.find((e) => matchFilter({ kinds: [10019], authors: [event.pubkey] }, e))
      ? true
      : false;

    event.author_stats = authorStats[event.pubkey];
    event.event_stats = eventStats[event.id];
  }

  return a;
}

/** Collect event targets (eg reposts, quote posts, reacted posts, etc.) */
function gatherRelatedEvents({ events, relay, signal }: HydrateOpts): Promise<DittoEvent[]> {
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

  return relay.query(
    [{ ids: [...ids], limit: ids.size }],
    { signal },
  );
}

/** Collect quotes from the events. */
function gatherQuotes({ events, relay, signal }: HydrateOpts): Promise<DittoEvent[]> {
  const ids = new Set<string>();

  for (const event of events) {
    if (event.kind === 1) {
      const id = findQuoteTag(event.tags)?.[1] || findQuoteInContent(event.content);
      if (id) {
        ids.add(id);
      }
    }
  }

  return relay.query(
    [{ ids: [...ids], limit: ids.size }],
    { signal },
  );
}

/** Collect profiles from the events. */
async function gatherProfiles({ events, relay, signal }: HydrateOpts): Promise<DittoEvent[]> {
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

  const authors = await relay.query(
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
async function gatherUsers({ conf, events, relay, signal }: HydrateOpts): Promise<DittoEvent[]> {
  const pubkeys = new Set(events.map((event) => event.pubkey));

  if (!pubkeys.size) {
    return Promise.resolve([]);
  }

  return relay.query(
    [{ kinds: [30382], authors: [await conf.signer.getPublicKey()], '#d': [...pubkeys], limit: pubkeys.size }],
    { signal },
  );
}

/** Collect info events from the events. */
async function gatherInfo({ conf, events, relay, signal }: HydrateOpts): Promise<DittoEvent[]> {
  const ids = new Set<string>();

  for (const event of events) {
    if (event.kind === 1984 || event.kind === 3036) {
      ids.add(event.id);
    }
  }

  if (!ids.size) {
    return Promise.resolve([]);
  }

  return relay.query(
    [{ kinds: [30383], authors: [await conf.signer.getPublicKey()], '#d': [...ids], limit: ids.size }],
    { signal },
  );
}

/** Collect nutzap informational events. */
function gatherAcceptCashu({ events, relay, signal }: HydrateOpts): Promise<DittoEvent[]> {
  const pubkeys = new Set<string>();

  for (const event of events) {
    pubkeys.add(event.pubkey);
  }

  if (!pubkeys.size) {
    return Promise.resolve([]);
  }

  return relay.query(
    [{ kinds: [10019], authors: [...pubkeys], limit: pubkeys.size }],
    { signal },
  );
}

function gatherClients({ events, relay, signal }: HydrateOpts): Promise<DittoEvent[]> {
  const filters: NostrFilter[] = [];

  for (const event of events) {
    for (const [name, _value, addr] of event.tags) {
      if (name === 'client' && addr) {
        const match = addr.match(/^31990:([0-9a-f]{64}):(.+)$/);
        if (match) {
          const [, pubkey, d] = match;
          filters.push({ kinds: [31990], authors: [pubkey], '#d': [d], limit: 1 });
        }
      }
    }
  }

  if (!filters.length) {
    return Promise.resolve([]);
  }

  return relay.query(filters, { signal });
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
    zaps_amount_cashu: Math.max(0, row.zaps_amount_cashu),
    link_preview: row.link_preview,
  }));
}

export { hydrateEvents };

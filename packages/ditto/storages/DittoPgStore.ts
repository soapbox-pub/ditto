// deno-lint-ignore-file require-await

import { type DittoConf } from '@ditto/conf';
import { type DittoDB, type DittoTables } from '@ditto/db';
import { detectLanguage } from '@ditto/lang';
import { NPostgres, NPostgresSchema } from '@nostrify/db';
import { dbEventsCounter, internalSubscriptionsBytesGauge, internalSubscriptionsSizeGauge } from '@ditto/metrics';
import {
  NIP50,
  NKinds,
  NostrEvent,
  NostrFilter,
  NostrRelayCLOSED,
  NostrRelayEOSE,
  NostrRelayEVENT,
  NSchema as n,
} from '@nostrify/nostrify';
import { Machina } from '@nostrify/nostrify/utils';
import { logi } from '@soapbox/logi';
import { JsonValue } from '@std/json';
import { LanguageCode } from 'iso-639-1';
import { Kysely } from 'kysely';
import linkify from 'linkifyjs';
import { LRUCache } from 'lru-cache';
import { matchFilter, nip27 } from 'nostr-tools';
import tldts from 'tldts';
import { z } from 'zod';

import { RelayError } from '@/RelayError.ts';
import { isNostrId } from '@/utils.ts';
import { abortError } from '@/utils/abort.ts';
import { purifyEvent } from '@/utils/purify.ts';
import { DittoEvent } from '@/interfaces/DittoEvent.ts';
import { getMediaLinks } from '@/utils/note.ts';
import { updateStats } from '@/utils/stats.ts';

/** Function to decide whether or not to index a tag. */
type TagCondition = (opts: TagConditionOpts) => boolean;

/** Options for the tag condition function. */
interface TagConditionOpts {
  /** Nostr event whose tags are being indexed. */
  event: NostrEvent;
  /** Count of the current tag name so far. Each tag name has a separate counter starting at 0. */
  count: number;
  /** Overall tag index. */
  index: number;
  /** Current vag value. */
  value: string;
}

/** Options for the EventsDB store. */
interface DittoPgStoreOpts {
  /** Kysely instance to use. */
  db: DittoDB;
  /** Ditto configuration. */
  conf: DittoConf;
  /** Timeout in milliseconds for database queries. */
  timeout?: number;
  /** Whether the event returned should be a Nostr event or a Ditto event. Defaults to false. */
  pure?: boolean;
  /** Chunk size for streaming events. Defaults to 20. */
  chunkSize?: number;
  /** Max age (in **seconds**) an event can be to be fulfilled to realtime subscribers. */
  maxAge?: number;
  /** Whether to listen for events from the database with NOTIFY. */
  notify?: boolean;
}

/** Realtime subscription. */
interface Subscription {
  filters: NostrFilter[];
  machina: Machina<NostrRelayEVENT | NostrRelayEOSE | NostrRelayCLOSED>;
}

/** SQL database storage adapter for Nostr events. */
export class DittoPgStore extends NPostgres {
  readonly subs = new Map<string, Subscription>();
  readonly encounters = new LRUCache<string, boolean>({ max: 1000 });

  /** Conditions for when to index certain tags. */
  static tagConditions: Record<string, TagCondition> = {
    'A': ({ count }) => count === 0,
    'E': ({ count, value }) => count === 0 && isNostrId(value),
    'I': ({ count }) => count === 0,
    'K': ({ count, value }) => count === 0 && Number.isInteger(Number(value)),
    'L': ({ event, count }) => event.kind === 1985 || count === 0,
    'P': ({ count, value }) => count === 0 && isNostrId(value),
    'a': ({ count }) => count < 15,
    'client': ({ count, value }) => count === 0 && value.length < 50,
    'd': ({ event, count }) => count === 0 && NKinds.parameterizedReplaceable(event.kind),
    'e': DittoPgStore.eTagCondition,
    'i': ({ count }) => count < 15,
    'k': ({ count }) => count < 3,
    'l': ({ event, count }) => event.kind === 1985 || count === 0,
    'n': ({ count, value }) => count < 50 && value.length < 50,
    'p': DittoPgStore.pTagCondition,
    'proxy': ({ count, value }) => count === 0 && value.length < 256,
    'q': ({ event, count, value }) => count === 0 && event.kind === 1 && isNostrId(value),
    'r': ({ event, count }) => (event.kind === 1985 ? count < 20 : count < 3),
    't': ({ event, count, value }) =>
      (value === value.toLowerCase()) && (event.kind === 1985 ? count < 20 : count < 5) && value.length < 50,
    'u': ({ count, value }) => {
      const { success } = z.string().url().safeParse(value); // TODO: maybe find a better library specific for validating web urls
      return count < 15 && success;
    },
  };

  constructor(private opts: DittoPgStoreOpts) {
    super(opts.db.kysely, {
      indexTags: DittoPgStore.indexTags,
      indexSearch: DittoPgStore.searchText,
      indexExtensions: DittoPgStore.indexExtensions,
      chunkSize: opts.chunkSize,
    });

    if (opts.notify) {
      opts.db.listen('nostr_event', async (id) => {
        if (this.encounters.has(id)) return;
        this.encounters.set(id, true);

        const [event] = await this.query([{ ids: [id] }]);

        if (event) {
          await this.fulfill(purifyEvent(event));
        }
      });
    }
  }

  /** Insert an event (and its tags) into the database. */
  override async event(event: NostrEvent, opts: { signal?: AbortSignal; timeout?: number } = {}): Promise<void> {
    event = purifyEvent(event);

    logi({ level: 'debug', ns: 'ditto.event', source: 'db', id: event.id, kind: event.kind });
    dbEventsCounter.inc({ kind: event.kind });

    if (NKinds.ephemeral(event.kind)) {
      if (this.encounters.has(event.id)) return;
      this.encounters.set(event.id, true);

      return await this.fulfill(event);
    }

    if (this.opts.notify) {
      this.encounters.set(event.id, true);
    }

    if (await this.isDeletedAdmin(event)) {
      throw new RelayError('blocked', 'event deleted by admin');
    }

    await this.deleteEventsAdmin(event);

    try {
      await this.storeEvent(event, { ...opts, timeout: opts.timeout ?? this.opts.timeout });
      this.fulfill(event); // don't await or catch (should never reject)
    } catch (e) {
      if (e instanceof Error) {
        switch (e.message) {
          case 'duplicate key value violates unique constraint "nostr_events_pkey"':
          case 'duplicate key value violates unique constraint "author_stats_pkey"':
            return;
          case 'canceling statement due to statement timeout':
            throw new RelayError('error', 'the event could not be added fast enough');
          default:
            throw e;
        }
      } else {
        throw e;
      }
    }
  }

  /** Maybe store the event, if eligible. */
  private async storeEvent(
    event: NostrEvent,
    opts: { signal?: AbortSignal; timeout?: number } = {},
  ): Promise<undefined> {
    const { conf } = this.opts;
    try {
      await super.transaction(async (relay, kysely) => {
        await updateStats({ conf, relay, kysely: kysely as unknown as Kysely<DittoTables>, event });
        await relay.event(event, opts);
      });
    } catch (e) {
      // If the failure is only because of updateStats (which runs first), insert the event anyway.
      // We can't catch this in the transaction because the error aborts the transaction on the Postgres side.
      if (e instanceof Error && e.message.includes('event_stats' satisfies keyof DittoTables)) {
        await super.event(event, opts);
      } else {
        throw e;
      }
    }
  }

  /** Fulfill active subscriptions with this event. */
  protected async fulfill(event: NostrEvent): Promise<void> {
    const { maxAge = 60 } = this.opts;

    const now = Math.floor(Date.now() / 1000);
    const age = now - event.created_at;

    if (age > maxAge) {
      // Ephemeral events must be fulfilled, or else return an error to the client.
      if (NKinds.ephemeral(event.kind)) {
        throw new RelayError('invalid', 'event too old');
      } else {
        // Silently ignore old events.
        return;
      }
    }

    for (const [subId, { filters, machina }] of this.subs.entries()) {
      for (const filter of filters) {
        if (this.matchesFilter(event, filter)) {
          machina.push(['EVENT', subId, event]);
          break;
        }
      }
    }
  }

  /** Check if the event fulfills the filter, according to Ditto criteria. */
  protected matchesFilter(event: NostrEvent, filter: NostrFilter): boolean {
    // TODO: support streaming by search.
    return typeof filter.search !== 'string' && matchFilter(filter, event);
  }

  /** Check if an event has been deleted by the admin. */
  private async isDeletedAdmin(event: NostrEvent): Promise<boolean> {
    const { conf } = this.opts;
    const adminPubkey = await conf.signer.getPublicKey();

    const filters: NostrFilter[] = [
      { kinds: [5], authors: [adminPubkey], '#e': [event.id], limit: 1 },
    ];

    if (NKinds.replaceable(event.kind) || NKinds.parameterizedReplaceable(event.kind)) {
      const d = event.tags.find(([tag]) => tag === 'd')?.[1] ?? '';

      filters.push({
        kinds: [5],
        authors: [adminPubkey],
        '#a': [`${event.kind}:${event.pubkey}:${d}`],
        since: event.created_at,
        limit: 1,
      });
    }

    const events = await this.query(filters);
    return events.length > 0;
  }

  /** The DITTO_NSEC can delete any event from the database. NDatabase already handles user deletions. */
  private async deleteEventsAdmin(event: NostrEvent): Promise<void> {
    const { conf } = this.opts;
    const adminPubkey = await conf.signer.getPublicKey();

    if (event.kind === 5 && event.pubkey === adminPubkey) {
      const ids = new Set(event.tags.filter(([name]) => name === 'e').map(([_name, value]) => value));
      const addrs = new Set(event.tags.filter(([name]) => name === 'a').map(([_name, value]) => value));

      const filters: NostrFilter[] = [];

      if (ids.size) {
        filters.push({ ids: [...ids] });
      }

      for (const addr of addrs) {
        const [k, pubkey, d] = addr.split(':');
        const kind = Number(k);

        if (!(Number.isInteger(kind) && kind >= 0)) continue;
        if (!isNostrId(pubkey)) continue;
        if (d === undefined) continue;

        const filter: NostrFilter = {
          kinds: [kind],
          authors: [pubkey],
          until: event.created_at,
        };

        if (d) {
          filter['#d'] = [d];
        }

        filters.push(filter);
      }

      if (filters.length) {
        await this.remove(filters);
      }
    }
  }

  override async *req(
    filters: NostrFilter[],
    opts: { timeout?: number; signal?: AbortSignal; limit?: number } = {},
  ): AsyncIterable<NostrRelayEVENT | NostrRelayEOSE | NostrRelayCLOSED> {
    const { db, chunkSize = 20 } = this.opts;
    const { limit, timeout = this.opts.timeout, signal } = opts;

    filters = await this.expandFilters(filters);

    const subId = crypto.randomUUID();
    const normalFilters = this.normalizeFilters(filters);
    const machina = new Machina<NostrRelayEVENT | NostrRelayEOSE | NostrRelayCLOSED>(signal);

    if (normalFilters.length && limit !== 0) {
      this.withTimeout(db.kysely as unknown as Kysely<NPostgresSchema>, timeout, async (trx) => {
        let query = this.getEventsQuery(trx, normalFilters);

        if (typeof opts.limit === 'number') {
          query = query.limit(opts.limit);
        }

        for await (const row of query.stream(chunkSize)) {
          const event = this.parseEventRow(row);
          machina.push(['EVENT', subId, event]);
        }

        machina.push(['EOSE', subId]);
      }).catch((error) => {
        if (error instanceof Error && (error.name === 'TimeoutError' || error.message.includes('timeout'))) {
          machina.push(['CLOSED', subId, 'error: the relay could not respond fast enough']);
        } else {
          machina.push(['CLOSED', subId, 'error: something went wrong']);
        }
      });

      try {
        for await (const msg of machina) {
          const [verb] = msg;

          yield msg;

          if (verb === 'EOSE') {
            break;
          }

          if (verb === 'CLOSED') {
            return;
          }
        }
      } catch {
        yield ['CLOSED', subId, 'error: the relay could not respond fast enough'];
        return;
      }
    } else {
      yield ['EOSE', subId];
    }

    const sizeBytes = new TextEncoder().encode(JSON.stringify(filters)).length;

    this.subs.set(subId, { filters, machina });
    internalSubscriptionsSizeGauge.set(this.subs.size);
    internalSubscriptionsBytesGauge.inc(sizeBytes);

    try {
      for await (const msg of machina) {
        yield msg;
      }
    } catch (e) {
      if (e instanceof Error && (e.name === 'TimeoutError' || e.message.includes('timeout'))) {
        yield ['CLOSED', subId, 'error: the relay could not respond fast enough'];
      } else {
        yield ['CLOSED', subId, 'error: something went wrong'];
      }
    } finally {
      this.subs.delete(subId);
      internalSubscriptionsSizeGauge.set(this.subs.size);
      internalSubscriptionsBytesGauge.dec(sizeBytes);
    }
  }

  /** Get events for filters from the database. */
  override async query(
    filters: NostrFilter[],
    opts: { signal?: AbortSignal; timeout?: number; limit?: number } = {},
  ): Promise<DittoEvent[]> {
    filters = await this.expandFilters(filters);

    if (opts.signal?.aborted) return Promise.resolve([]);

    logi({ level: 'debug', ns: 'ditto.req', source: 'db', filters: filters as JsonValue });

    return super.query(filters, { ...opts, timeout: opts.timeout ?? this.opts.timeout });
  }

  /** Parse an event row from the database. */
  protected override parseEventRow(row: NPostgresSchema['nostr_events']): DittoEvent {
    const event: DittoEvent = {
      id: row.id,
      kind: row.kind,
      pubkey: row.pubkey,
      content: row.content,
      created_at: Number(row.created_at),
      tags: row.tags,
      sig: row.sig,
    };

    if (!this.opts.pure) {
      event.language = row.search_ext.language as LanguageCode | undefined;
    }

    return event;
  }

  /** Delete events based on filters from the database. */
  override async remove(filters: NostrFilter[], opts: { signal?: AbortSignal; timeout?: number } = {}): Promise<void> {
    logi({ level: 'debug', ns: 'ditto.remove', source: 'db', filters: filters as JsonValue });
    return super.remove(filters, { ...opts, timeout: opts.timeout ?? this.opts.timeout });
  }

  /** Get number of events that would be returned by filters. */
  override async count(
    filters: NostrFilter[],
    opts: { signal?: AbortSignal; timeout?: number } = {},
  ): Promise<{ count: number; approximate: boolean }> {
    if (opts.signal?.aborted) return Promise.reject(abortError());

    logi({ level: 'debug', ns: 'ditto.count', source: 'db', filters: filters as JsonValue });

    return super.count(filters, { ...opts, timeout: opts.timeout ?? this.opts.timeout });
  }

  /** Rule for indexing `e` tags. */
  private static eTagCondition({ event, count, value, index }: TagConditionOpts): boolean {
    if (!isNostrId(value)) return false;

    if (event.kind === 7) {
      return index === event.tags.findLastIndex(([name]) => name === 'e');
    }

    return event.kind === 10003 || count < 15;
  }

  /** Rule for indexing `p` tags. */
  private static pTagCondition({ event, count, value, index }: TagConditionOpts): boolean {
    if (!isNostrId(value)) return false;

    if (event.kind === 7) {
      return index === event.tags.findLastIndex(([name]) => name === 'p');
    }

    return count < 15 || event.kind === 3;
  }

  /** Return only the tags that should be indexed. */
  static override indexTags(event: NostrEvent): string[][] {
    const tagCounts: Record<string, number> = {};

    function getCount(name: string) {
      return tagCounts[name] || 0;
    }

    function incrementCount(name: string) {
      tagCounts[name] = getCount(name) + 1;
    }

    function checkCondition(name: string, value: string, condition: TagCondition, index: number): boolean {
      return condition({
        event,
        count: getCount(name),
        value,
        index,
      });
    }

    return event.tags.reduce<string[][]>((results, tag, index) => {
      const [name, value] = tag;
      const condition = DittoPgStore.tagConditions[name] as TagCondition | undefined;

      if (value && condition && value.length < 200 && checkCondition(name, value, condition, index)) {
        results.push(tag);
      }

      incrementCount(name);
      return results;
    }, []);
  }

  static indexExtensions(event: NostrEvent): Record<string, string> {
    const ext: Record<string, string> = {};

    if (event.kind === 1) {
      ext.reply = event.tags.some(([name]) => name === 'e').toString();
    } else if (event.kind === 1111) {
      ext.reply = event.tags.some(([name]) => ['e', 'E'].includes(name)).toString();
    } else if (event.kind === 6) {
      ext.reply = 'false';
    }

    if ([1, 20, 30023].includes(event.kind)) {
      const language = detectLanguage(event.content, 0.90);

      if (language) {
        ext.language = language;
      }
    }

    const imeta: string[][][] = event.tags
      .filter(([name]) => name === 'imeta')
      .map(([_, ...entries]) =>
        entries.map((entry) => {
          const split = entry.split(' ');
          return [split[0], split.splice(1).join(' ')];
        })
      );

    // quirks mode
    if (!imeta.length && event.kind === 1) {
      const links = linkify.find(event.content).filter(({ type }) => type === 'url');
      imeta.push(...getMediaLinks(links));
    }

    if (imeta.length) {
      ext.media = 'true';

      if (imeta.every((tags) => tags.some(([name, value]) => name === 'm' && value.startsWith('video/')))) {
        ext.video = 'true';
      }
    }

    const client = event.tags.find(([name]) => name === 'client')?.[2];

    if (client && /^31990:([0-9a-f]{64}):(.+)$/.test(client)) {
      ext.client = client;
    }

    ext.protocol = event.tags.find(([name]) => name === 'proxy')?.[2] ?? 'nostr';

    return ext;
  }

  /** Build a search index from the event. */
  static searchText(event: NostrEvent): string {
    switch (event.kind) {
      case 0:
        return DittoPgStore.buildUserSearchContent(event);
      case 1:
      case 20:
        return nip27.replaceAll(event.content, () => '');
      case 30009:
        return DittoPgStore.buildTagsSearchContent(event.tags.filter(([t]) => t !== 'alt'));
      case 30360:
        return event.tags.find(([name]) => name === 'd')?.[1] || '';
      default:
        return '';
    }
  }

  /** Build search content for a user. */
  static buildUserSearchContent(event: NostrEvent): string {
    const { name, nip05 } = n.json().pipe(n.metadata()).catch({}).parse(event.content);
    return [name, nip05].filter(Boolean).join('\n');
  }

  /** Build search content from tag values. */
  static buildTagsSearchContent(tags: string[][]): string {
    return tags.map(([_tag, value]) => value).join('\n');
  }

  /** Converts filters to more performant, simpler filters. */
  async expandFilters(filters: NostrFilter[]): Promise<NostrFilter[]> {
    filters = structuredClone(filters);

    for (const filter of filters) {
      if (filter.since && filter.since >= 2_147_483_647) {
        throw new RelayError('invalid', 'since filter too far into the future');
      }
      if (filter.until && filter.until >= 2_147_483_647) {
        throw new RelayError('invalid', 'until filter too far into the future');
      }
      for (const kind of filter.kinds ?? []) {
        if (kind >= 2_147_483_647) {
          throw new RelayError('invalid', 'kind filter too far into the future');
        }
      }

      if (filter.search) {
        const tokens = NIP50.parseInput(filter.search);

        const domains = new Set<string>();
        const hostnames = new Set<string>();

        for (const token of tokens) {
          if (typeof token === 'object' && token.key === 'domain') {
            const { domain, hostname } = tldts.parse(token.value);
            if (domain === hostname) {
              domains.add(token.value);
            } else {
              hostnames.add(token.value);
            }
          }
        }

        if (domains.size || hostnames.size) {
          let query = this.opts.db.kysely
            .selectFrom('author_stats')
            .select('pubkey')
            .where((eb) => {
              const expr = [];
              if (domains.size) {
                expr.push(eb('nip05_domain', 'in', [...domains]));
              }
              if (hostnames.size) {
                expr.push(eb('nip05_hostname', 'in', [...hostnames]));
              }
              if (expr.length === 1) {
                return expr[0];
              }
              return eb.or(expr);
            });

          if (filter.authors) {
            query = query.where('pubkey', 'in', filter.authors);
          }

          const pubkeys = await query.execute().then((rows) => rows.map((row) => row.pubkey));

          filter.authors = pubkeys;
        }

        // Re-serialize the search string without the domain key. :facepalm:
        filter.search = tokens
          .filter((t) => typeof t === 'string' || typeof t === 'object' && t.key !== 'domain')
          .map((t) => typeof t === 'object' ? `${t.key}:${t.value}` : t)
          .join(' ');
      }
    }

    return filters;
  }

  /** Execute the callback in a new transaction, unless the Kysely instance is already a transaction. */
  private static override async trx<T = unknown>(
    db: Kysely<DittoTables>,
    callback: (trx: Kysely<DittoTables>) => Promise<T>,
  ): Promise<T> {
    if (db.isTransaction) {
      return await callback(db);
    } else {
      return await db.transaction().execute((trx) => callback(trx));
    }
  }

  /** Execute NPostgres functions in a transaction. */
  // @ts-ignore gg
  override async transaction(
    callback: (store: DittoPgStore, kysely: Kysely<DittoTables>) => Promise<void>,
  ): Promise<void> {
    const { db } = this.opts;

    await DittoPgStore.trx(db.kysely, async (trx) => {
      const store = new DittoPgStore({ ...this.opts, db: { ...db, kysely: trx }, notify: false });
      await callback(store, trx);
    });
  }
}

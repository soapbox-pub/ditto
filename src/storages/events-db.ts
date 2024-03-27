import { NIP50, NostrFilter } from '@soapbox/nspec';
import { Conf } from '@/config.ts';
import { type DittoDB } from '@/db.ts';
import { Debug, Kysely, type NostrEvent, type NStore, type NStoreOpts, type SelectQueryBuilder } from '@/deps.ts';
import { normalizeFilters } from '@/filter.ts';
import { DittoEvent } from '@/interfaces/DittoEvent.ts';
import { isDittoInternalKind, isParameterizedReplaceableKind, isReplaceableKind } from '@/kinds.ts';
import { jsonMetaContentSchema } from '@/schemas/nostr.ts';
import { purifyEvent } from '@/storages/hydrate.ts';
import { isNostrId, isURL } from '@/utils.ts';
import { abortError } from '@/utils/abort.ts';

/** Function to decide whether or not to index a tag. */
type TagCondition = ({ event, count, value }: {
  event: DittoEvent;
  count: number;
  value: string;
}) => boolean;

/** Conditions for when to index certain tags. */
const tagConditions: Record<string, TagCondition> = {
  'd': ({ event, count }) => count === 0 && isParameterizedReplaceableKind(event.kind),
  'e': ({ event, count, value }) => ((event.user && event.kind === 10003) || count < 15) && isNostrId(value),
  'L': ({ event, count }) => event.kind === 1985 || count === 0,
  'l': ({ event, count }) => event.kind === 1985 || count === 0,
  'media': ({ event, count, value }) => (event.user || count < 4) && isURL(value),
  'P': ({ event, count, value }) => event.kind === 9735 && count === 0 && isNostrId(value),
  'p': ({ event, count, value }) => (count < 15 || event.kind === 3) && isNostrId(value),
  'proxy': ({ count, value }) => count === 0 && isURL(value),
  'q': ({ event, count, value }) => count === 0 && event.kind === 1 && isNostrId(value),
  't': ({ count, value }) => count < 5 && value.length < 50,
  'name': ({ event, count }) => event.kind === 30361 && count === 0,
  'role': ({ event, count }) => event.kind === 30361 && count === 0,
};

type EventQuery = SelectQueryBuilder<DittoDB, 'events', {
  id: string;
  tags: string;
  kind: number;
  pubkey: string;
  content: string;
  created_at: number;
  sig: string;
  stats_replies_count?: number;
  stats_reposts_count?: number;
  stats_reactions_count?: number;
  author_id?: string;
  author_tags?: string;
  author_kind?: number;
  author_pubkey?: string;
  author_content?: string;
  author_created_at?: number;
  author_sig?: string;
  author_stats_followers_count?: number;
  author_stats_following_count?: number;
  author_stats_notes_count?: number;
}>;

/** SQLite database storage adapter for Nostr events. */
class EventsDB implements NStore {
  #db: Kysely<DittoDB>;
  #debug = Debug('ditto:db:events');

  constructor(db: Kysely<DittoDB>) {
    this.#db = db;
  }

  /** Insert an event (and its tags) into the database. */
  async event(event: NostrEvent, _opts?: NStoreOpts): Promise<void> {
    event = purifyEvent(event);
    this.#debug('EVENT', JSON.stringify(event));

    if (isDittoInternalKind(event.kind) && event.pubkey !== Conf.pubkey) {
      throw new Error('Internal events can only be stored by the server keypair');
    }

    return await this.#db.transaction().execute(async (trx) => {
      /** Insert the event into the database. */
      async function addEvent() {
        await trx.insertInto('events')
          .values({ ...event, tags: JSON.stringify(event.tags) })
          .execute();
      }

      /** Add search data to the FTS table. */
      async function indexSearch() {
        const searchContent = buildSearchContent(event);
        if (!searchContent) return;
        await trx.insertInto('events_fts')
          .values({ id: event.id, content: searchContent.substring(0, 1000) })
          .execute();
      }

      /** Index event tags depending on the conditions defined above. */
      async function indexTags() {
        const tags = filterIndexableTags(event);
        const rows = tags.map(([tag, value]) => ({ event_id: event.id, tag, value }));

        if (!tags.length) return;
        await trx.insertInto('tags')
          .values(rows)
          .execute();
      }

      if (isReplaceableKind(event.kind)) {
        const prevEvents = await this.getFilterQuery(trx, { kinds: [event.kind], authors: [event.pubkey] }).execute();
        for (const prevEvent of prevEvents) {
          if (prevEvent.created_at >= event.created_at) {
            throw new Error('Cannot replace an event with an older event');
          }
        }
        await this.deleteEventsTrx(trx, [{ kinds: [event.kind], authors: [event.pubkey] }]);
      }

      if (isParameterizedReplaceableKind(event.kind)) {
        const d = event.tags.find(([tag]) => tag === 'd')?.[1];
        if (d) {
          const prevEvents = await this.getFilterQuery(trx, { kinds: [event.kind], authors: [event.pubkey], '#d': [d] })
            .execute();
          for (const prevEvent of prevEvents) {
            if (prevEvent.created_at >= event.created_at) {
              throw new Error('Cannot replace an event with an older event');
            }
          }
          await this.deleteEventsTrx(trx, [{ kinds: [event.kind], authors: [event.pubkey], '#d': [d] }]);
        }
      }

      // Run the queries.
      await Promise.all([
        addEvent(),
        indexTags(),
        indexSearch(),
      ]);
    }).catch((error) => {
      // Don't throw for duplicate events.
      if (error.message.includes('UNIQUE constraint failed')) {
        return;
      } else {
        throw error;
      }
    });
  }

  /** Build the query for a filter. */
  getFilterQuery(db: Kysely<DittoDB>, filter: NostrFilter): EventQuery {
    let query = db
      .selectFrom('events')
      .select([
        'events.id',
        'events.kind',
        'events.pubkey',
        'events.content',
        'events.tags',
        'events.created_at',
        'events.sig',
      ])
      .where('events.deleted_at', 'is', null)
      .orderBy('events.created_at', 'desc');

    for (const [key, value] of Object.entries(filter)) {
      if (value === undefined) continue;

      switch (key as keyof NostrFilter) {
        case 'ids':
          query = query.where('events.id', 'in', filter.ids!);
          break;
        case 'kinds':
          query = query.where('events.kind', 'in', filter.kinds!);
          break;
        case 'authors':
          query = query.where('events.pubkey', 'in', filter.authors!);
          break;
        case 'since':
          query = query.where('events.created_at', '>=', filter.since!);
          break;
        case 'until':
          query = query.where('events.created_at', '<=', filter.until!);
          break;
        case 'limit':
          query = query.limit(filter.limit!);
          break;
      }
    }

    const joinedQuery = query.leftJoin('tags', 'tags.event_id', 'events.id');

    for (const [key, value] of Object.entries(filter)) {
      if (key.startsWith('#') && Array.isArray(value)) {
        const name = key.replace(/^#/, '');
        query = joinedQuery
          .where('tags.tag', '=', name)
          .where('tags.value', 'in', value);
      }
    }

    if (filter.search) {
      query = query
        .innerJoin('events_fts', 'events_fts.id', 'events.id')
        .where('events_fts.content', 'match', JSON.stringify(filter.search));
    }

    return query;
  }

  /** Combine filter queries into a single union query. */
  getEventsQuery(filters: NostrFilter[]) {
    return filters
      .map((filter) => this.#db.selectFrom(() => this.getFilterQuery(this.#db, filter).as('events')).selectAll())
      .reduce((result, query) => result.unionAll(query));
  }

  /** Query to get user events, joined by tags. */
  usersQuery() {
    return this.getFilterQuery(this.#db, { kinds: [30361], authors: [Conf.pubkey] })
      .leftJoin('tags', 'tags.event_id', 'events.id')
      .where('tags.tag', '=', 'd')
      .select('tags.value as d_tag')
      .as('users');
  }

  /** Converts filters to more performant, simpler filters that are better for SQLite. */
  async expandFilters(filters: NostrFilter[]): Promise<NostrFilter[]> {
    filters = normalizeFilters(filters); // Improves performance of `{ kinds: [0], authors: ['...'] }` queries.

    for (const filter of filters) {
      if (filter.search) {
        const tokens = NIP50.parseInput(filter.search);

        const domain = (tokens.find((t) =>
          typeof t === 'object' && t.key === 'domain'
        ) as { key: 'domain'; value: string } | undefined)?.value;

        if (domain) {
          const query = this.#db
            .selectFrom('pubkey_domains')
            .select('pubkey')
            .where('domain', '=', domain);

          if (filter.authors) {
            query.where('pubkey', 'in', filter.authors);
          }

          const pubkeys = await query
            .execute()
            .then((rows) =>
              rows.map((row) => row.pubkey)
            );

          filter.authors = pubkeys;
        }

        filter.search = tokens.filter((t) => typeof t === 'string').join(' ');
      }
    }

    return filters;
  }

  /** Get events for filters from the database. */
  async query(filters: NostrFilter[], opts: NStoreOpts = {}): Promise<DittoEvent[]> {
    filters = await this.expandFilters(filters);

    if (opts.signal?.aborted) return Promise.resolve([]);
    if (!filters.length) return Promise.resolve([]);

    this.#debug('REQ', JSON.stringify(filters));
    let query = this.getEventsQuery(filters);

    if (typeof opts.limit === 'number') {
      query = query.limit(opts.limit);
    }

    return (await query.execute()).map((row) => {
      const event: DittoEvent = {
        id: row.id,
        kind: row.kind,
        pubkey: row.pubkey,
        content: row.content,
        created_at: row.created_at,
        tags: JSON.parse(row.tags),
        sig: row.sig,
      };

      if (row.author_id) {
        event.author = {
          id: row.author_id,
          kind: row.author_kind! as 0,
          pubkey: row.author_pubkey!,
          content: row.author_content!,
          created_at: row.author_created_at!,
          tags: JSON.parse(row.author_tags!),
          sig: row.author_sig!,
        };
      }

      if (typeof row.author_stats_followers_count === 'number') {
        event.author_stats = {
          followers_count: row.author_stats_followers_count,
          following_count: row.author_stats_following_count!,
          notes_count: row.author_stats_notes_count!,
        };
      }

      if (typeof row.stats_replies_count === 'number') {
        event.event_stats = {
          replies_count: row.stats_replies_count,
          reposts_count: row.stats_reposts_count!,
          reactions_count: row.stats_reactions_count!,
        };
      }

      return event;
    });
  }

  /** Delete events from each table. Should be run in a transaction! */
  async deleteEventsTrx(db: Kysely<DittoDB>, filters: NostrFilter[]) {
    if (!filters.length) return Promise.resolve();
    this.#debug('DELETE', JSON.stringify(filters));

    const query = this.getEventsQuery(filters).clearSelect().select('id');

    return await db.updateTable('events')
      .where('id', 'in', () => query)
      .set({ deleted_at: Math.floor(Date.now() / 1000) })
      .execute();
  }

  /** Delete events based on filters from the database. */
  async remove(filters: NostrFilter[], _opts?: NStoreOpts): Promise<void> {
    if (!filters.length) return Promise.resolve();
    this.#debug('DELETE', JSON.stringify(filters));

    await this.#db.transaction().execute((trx) => this.deleteEventsTrx(trx, filters));
  }

  /** Get number of events that would be returned by filters. */
  async count(filters: NostrFilter[], opts: NStoreOpts = {}): Promise<{ count: number; approximate: boolean }> {
    if (opts.signal?.aborted) return Promise.reject(abortError());
    if (!filters.length) return Promise.resolve({ count: 0, approximate: false });

    this.#debug('COUNT', JSON.stringify(filters));
    const query = this.getEventsQuery(filters);

    const [{ count }] = await query
      .clearSelect()
      .select((eb) => eb.fn.count('id').as('count'))
      .execute();

    return {
      count: Number(count),
      approximate: false,
    };
  }
}

/** Return only the tags that should be indexed. */
function filterIndexableTags(event: DittoEvent): string[][] {
  const tagCounts: Record<string, number> = {};

  function getCount(name: string) {
    return tagCounts[name] || 0;
  }

  function incrementCount(name: string) {
    tagCounts[name] = getCount(name) + 1;
  }

  function checkCondition(name: string, value: string, condition: TagCondition) {
    return condition({
      event,
      count: getCount(name),
      value,
    });
  }

  return event.tags.reduce<string[][]>((results, tag) => {
    const [name, value] = tag;
    const condition = tagConditions[name] as TagCondition | undefined;

    if (value && condition && value.length < 200 && checkCondition(name, value, condition)) {
      results.push(tag);
    }

    incrementCount(name);
    return results;
  }, []);
}

/** Build a search index from the event. */
function buildSearchContent(event: NostrEvent): string {
  switch (event.kind) {
    case 0:
      return buildUserSearchContent(event);
    case 1:
      return event.content;
    case 30009:
      return buildTagsSearchContent(event.tags.filter(([t]) => t !== 'alt'));
    default:
      return '';
  }
}

/** Build search content for a user. */
function buildUserSearchContent(event: NostrEvent): string {
  const { name, nip05, about } = jsonMetaContentSchema.parse(event.content);
  return [name, nip05, about].filter(Boolean).join('\n');
}

/** Build search content from tag values. */
function buildTagsSearchContent(tags: string[][]): string {
  return tags.map(([_tag, value]) => value).join('\n');
}

export { EventsDB };

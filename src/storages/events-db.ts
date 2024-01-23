import { Conf } from '@/config.ts';
import { type DittoDB } from '@/db.ts';
import { Debug, type Event, Kysely, type SelectQueryBuilder } from '@/deps.ts';
import { type DittoFilter, normalizeFilters } from '@/filter.ts';
import { isDittoInternalKind, isParameterizedReplaceableKind, isReplaceableKind } from '@/kinds.ts';
import { jsonMetaContentSchema } from '@/schemas/nostr.ts';
import { isNostrId, isURL } from '@/utils.ts';

import { type DittoEvent, EventStore, type GetEventsOpts } from './types.ts';

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
class EventsDB implements EventStore {
  #db: Kysely<DittoDB>;
  #debug = Debug('ditto:db:events');

  /** NIPs supported by this storage method. */
  supportedNips = [1, 45, 50];

  constructor(db: Kysely<DittoDB>) {
    this.#db = db;
  }

  /** Insert an event (and its tags) into the database. */
  async add(event: DittoEvent): Promise<void> {
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
  getFilterQuery(db: Kysely<DittoDB>, filter: DittoFilter): EventQuery {
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
      .orderBy('events.created_at', 'desc');

    for (const [key, value] of Object.entries(filter)) {
      if (value === undefined) continue;

      switch (key as keyof DittoFilter) {
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

      if (key.startsWith('#')) {
        const tag = key.replace(/^#/, '');
        const value = filter[key as `#${string}`] as string[];
        query = query
          .leftJoin('tags', 'tags.event_id', 'events.id')
          .where('tags.tag', '=', tag)
          .where('tags.value', 'in', value);
      }
    }

    if (typeof filter.local === 'boolean') {
      query = query
        .leftJoin(() => this.usersQuery(), (join) => join.onRef('users.d_tag', '=', 'events.pubkey'))
        .where('users.d_tag', filter.local ? 'is not' : 'is', null);
    }

    if (filter.relations?.includes('author')) {
      query = query
        .leftJoin(
          (eb) =>
            eb
              .selectFrom('events')
              .selectAll()
              .where('kind', '=', 0)
              .groupBy('pubkey')
              .as('authors'),
          (join) => join.onRef('authors.pubkey', '=', 'events.pubkey'),
        )
        .select([
          'authors.id as author_id',
          'authors.kind as author_kind',
          'authors.pubkey as author_pubkey',
          'authors.content as author_content',
          'authors.tags as author_tags',
          'authors.created_at as author_created_at',
          'authors.sig as author_sig',
        ]);
    }

    if (filter.relations?.includes('author_stats')) {
      query = query
        .leftJoin('author_stats', 'author_stats.pubkey', 'events.pubkey')
        .select((eb) => [
          eb.fn.coalesce('author_stats.followers_count', eb.val(0)).as('author_stats_followers_count'),
          eb.fn.coalesce('author_stats.following_count', eb.val(0)).as('author_stats_following_count'),
          eb.fn.coalesce('author_stats.notes_count', eb.val(0)).as('author_stats_notes_count'),
        ]);
    }

    if (filter.relations?.includes('event_stats')) {
      query = query
        .leftJoin('event_stats', 'event_stats.event_id', 'events.id')
        .select((eb) => [
          eb.fn.coalesce('event_stats.replies_count', eb.val(0)).as('stats_replies_count'),
          eb.fn.coalesce('event_stats.reposts_count', eb.val(0)).as('stats_reposts_count'),
          eb.fn.coalesce('event_stats.reactions_count', eb.val(0)).as('stats_reactions_count'),
        ]);
    }

    if (filter.search) {
      query = query
        .innerJoin('events_fts', 'events_fts.id', 'events.id')
        .where('events_fts.content', 'match', JSON.stringify(filter.search));
    }

    return query;
  }

  /** Combine filter queries into a single union query. */
  getEventsQuery(filters: DittoFilter[]) {
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

  /** Get events for filters from the database. */
  async filter<K extends number>(filters: DittoFilter<K>[], opts: GetEventsOpts = {}): Promise<DittoEvent<K>[]> {
    filters = normalizeFilters(filters); // Improves performance of `{ kinds: [0], authors: ['...'] }` queries.

    if (opts.signal?.aborted) return Promise.resolve([]);
    if (!filters.length) return Promise.resolve([]);

    this.#debug('REQ', JSON.stringify(filters));
    let query = this.getEventsQuery(filters);

    if (typeof opts.limit === 'number') {
      query = query.limit(opts.limit);
    }

    return (await query.execute()).map((row) => {
      const event: DittoEvent<K> = {
        id: row.id,
        kind: row.kind as K,
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
  async deleteEventsTrx(db: Kysely<DittoDB>, filters: DittoFilter[]) {
    if (!filters.length) return Promise.resolve();
    this.#debug('DELETE', JSON.stringify(filters));

    const query = this.getEventsQuery(filters).clearSelect().select('id');

    await db.deleteFrom('events_fts')
      .where('id', 'in', () => query)
      .execute();

    return db.deleteFrom('events')
      .where('id', 'in', () => query)
      .execute();
  }

  /** Delete events based on filters from the database. */
  async deleteFilters<K extends number>(filters: DittoFilter<K>[]): Promise<void> {
    if (!filters.length) return Promise.resolve();
    this.#debug('DELETE', JSON.stringify(filters));

    await this.#db.transaction().execute((trx) => this.deleteEventsTrx(trx, filters));
  }

  /** Get number of events that would be returned by filters. */
  async count<K extends number>(filters: DittoFilter<K>[]): Promise<number> {
    if (!filters.length) return Promise.resolve(0);
    this.#debug('COUNT', JSON.stringify(filters));
    const query = this.getEventsQuery(filters);

    const [{ count }] = await query
      .clearSelect()
      .select((eb) => eb.fn.count('id').as('count'))
      .execute();

    return Number(count);
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
function buildSearchContent(event: Event): string {
  switch (event.kind) {
    case 0:
      return buildUserSearchContent(event as Event<0>);
    case 1:
      return event.content;
    case 30009:
      return buildTagsSearchContent(event.tags.filter(([t]) => t !== 'alt'));
    default:
      return '';
  }
}

/** Build search content for a user. */
function buildUserSearchContent(event: Event<0>): string {
  const { name, nip05, about } = jsonMetaContentSchema.parse(event.content);
  return [name, nip05, about].filter(Boolean).join('\n');
}

/** Build search content from tag values. */
function buildTagsSearchContent(tags: string[][]): string {
  return tags.map(([_tag, value]) => value).join('\n');
}

export { EventsDB };

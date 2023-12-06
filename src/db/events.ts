import { db, type DittoDB } from '@/db.ts';
import { type Event, type SelectQueryBuilder } from '@/deps.ts';
import { isParameterizedReplaceableKind } from '@/kinds.ts';
import { jsonMetaContentSchema } from '@/schemas/nostr.ts';
import { EventData } from '@/types.ts';
import { isNostrId, isURL } from '@/utils.ts';

import type { DittoFilter, GetFiltersOpts } from '@/filter.ts';

/** Function to decide whether or not to index a tag. */
type TagCondition = ({ event, count, value }: {
  event: Event;
  data: EventData;
  count: number;
  value: string;
}) => boolean;

/** Conditions for when to index certain tags. */
const tagConditions: Record<string, TagCondition> = {
  'd': ({ event, count }) => count === 0 && isParameterizedReplaceableKind(event.kind),
  'e': ({ count, value }) => count < 15 && isNostrId(value),
  'media': ({ count, value, data }) => (data.user || count < 4) && isURL(value),
  'p': ({ event, count, value }) => (count < 15 || event.kind === 3) && isNostrId(value),
  'proxy': ({ count, value }) => count === 0 && isURL(value),
  'q': ({ event, count, value }) => count === 0 && event.kind === 1 && isNostrId(value),
  't': ({ count, value }) => count < 5 && value.length < 50,
};

/** Insert an event (and its tags) into the database. */
function insertEvent(event: Event, data: EventData): Promise<void> {
  return db.transaction().execute(async (trx) => {
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
      const tags = filterIndexableTags(event, data);
      const rows = tags.map(([tag, value]) => ({ event_id: event.id, tag, value }));

      if (!tags.length) return;
      await trx.insertInto('tags')
        .values(rows)
        .execute();
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

type EventQuery = SelectQueryBuilder<DittoDB, 'events', {
  id: string;
  tags: string;
  kind: number;
  pubkey: string;
  content: string;
  created_at: number;
  sig: string;
  author_id?: string;
  author_tags?: string;
  author_kind?: number;
  author_pubkey?: string;
  author_content?: string;
  author_created_at?: number;
  author_sig?: string;
}>;

/** Build the query for a filter. */
function getFilterQuery(filter: DittoFilter): EventQuery {
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
        .where('tags.value', 'in', value) as typeof query;
    }
  }

  if (typeof filter.local === 'boolean') {
    query = filter.local
      ? query.innerJoin('users', 'users.pubkey', 'events.pubkey') as typeof query
      : query.leftJoin('users', 'users.pubkey', 'events.pubkey').where('users.pubkey', 'is', null) as typeof query;
  }

  if (filter.search) {
    query = query
      .innerJoin('events_fts', 'events_fts.id', 'events.id')
      .where('events_fts.content', 'match', JSON.stringify(filter.search));
  }

  return query;
}

/** Combine filter queries into a single union query. */
function getFiltersQuery(filters: DittoFilter[]) {
  return filters
    .map((filter) => db.selectFrom(() => getFilterQuery(filter).as('events')).selectAll())
    .reduce((result, query) => result.unionAll(query));
}

interface DittoEvent<K extends number = number> extends Event<K> {
  author?: Event<0>;
}

/** Get events for filters from the database. */
async function getFilters<K extends number>(
  filters: DittoFilter<K>[],
  opts: GetFiltersOpts = {},
): Promise<DittoEvent<K>[]> {
  if (!filters.length) return Promise.resolve([]);
  let query = getFiltersQuery(filters);

  if (opts.with?.includes('authors')) {
    query = query
      .leftJoin(
        (eb) =>
          eb
            .selectFrom('events')
            .selectAll()
            .where('kind', '=', 0)
            .orderBy('created_at', 'desc')
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
      ]) as typeof query;
  }

  if (typeof opts.limit === 'number') {
    query = query.limit(opts.limit);
  }

  return (await query.execute()).map((row) => ({
    id: row.id,
    kind: row.kind,
    pubkey: row.pubkey,
    content: row.content,
    created_at: row.created_at,
    tags: JSON.parse(row.tags),
    author: row.author_id
      ? {
        id: row.author_id,
        kind: row.author_kind!,
        pubkey: row.author_pubkey!,
        content: row.author_content!,
        created_at: row.author_created_at!,
        tags: JSON.parse(row.author_tags!),
        sig: row.author_sig!,
      }
      : undefined,
    sig: row.sig,
  } as DittoEvent<K>));
}

/** Delete events based on filters from the database. */
function deleteFilters<K extends number>(filters: DittoFilter<K>[]) {
  if (!filters.length) return Promise.resolve([]);

  return db.transaction().execute(async (trx) => {
    const query = getFiltersQuery(filters).clearSelect().select('id');

    await trx.deleteFrom('events_fts')
      .where('id', 'in', () => query)
      .execute();

    return trx.deleteFrom('events')
      .where('id', 'in', () => query)
      .execute();
  });
}

/** Get number of events that would be returned by filters. */
async function countFilters<K extends number>(filters: DittoFilter<K>[]): Promise<number> {
  if (!filters.length) return Promise.resolve(0);
  const query = getFiltersQuery(filters);

  const [{ count }] = await query
    .clearSelect()
    .select((eb) => eb.fn.count('id').as('count'))
    .execute();

  return Number(count);
}

/** Return only the tags that should be indexed. */
function filterIndexableTags(event: Event, data: EventData): string[][] {
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
      data,
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
    default:
      return '';
  }
}

/** Build search content for a user. */
function buildUserSearchContent(event: Event<0>): string {
  const { name, nip05, about } = jsonMetaContentSchema.parse(event.content);
  return [name, nip05, about].filter(Boolean).join('\n');
}

export { countFilters, deleteFilters, getFilters, insertEvent };

import { db, type TagRow } from '@/db.ts';
import { type Event, type Insertable, SqliteError } from '@/deps.ts';

import type { DittoFilter, GetFiltersOpts } from '@/filter.ts';
import { jsonMetaContentSchema } from '@/schemas/nostr.ts';

type TagCondition = ({ event, count }: { event: Event; count: number }) => boolean;

/** Conditions for when to index certain tags. */
const tagConditions: Record<string, TagCondition> = {
  'd': ({ event, count }) => 30000 <= event.kind && event.kind < 40000 && count === 0,
  'e': ({ count }) => count < 15,
  'p': ({ event, count }) => event.kind === 3 || count < 15,
  'proxy': ({ count }) => count === 0,
  'q': ({ event, count }) => event.kind === 1 && count === 0,
  't': ({ count }) => count < 5,
};

/** Insert an event (and its tags) into the database. */
function insertEvent(event: Event): Promise<void> {
  return db.transaction().execute(async (trx) => {
    await trx.insertInto('events')
      .values({
        ...event,
        tags: JSON.stringify(event.tags),
      })
      .execute();

    const searchContent = buildSearchContent(event);
    if (searchContent) {
      await trx.insertInto('events_fts')
        .values({ id: event.id, content: searchContent.substring(0, 1000) })
        .execute();
    }

    const tagCounts: Record<string, number> = {};
    const tags = event.tags.reduce<Insertable<TagRow>[]>((results, tag) => {
      const tagName = tag[0];
      tagCounts[tagName] = (tagCounts[tagName] || 0) + 1;

      if (tagConditions[tagName]?.({ event, count: tagCounts[tagName] - 1 })) {
        results.push({
          event_id: event.id,
          tag: tagName,
          value_1: tag[1] || null,
          value_2: tag[2] || null,
          value_3: tag[3] || null,
        });
      }

      return results;
    }, []);

    if (tags.length) {
      await trx.insertInto('tags')
        .values(tags)
        .execute();
    }
  }).catch((error) => {
    // Don't throw for duplicate events.
    if (error instanceof SqliteError && error.code === 19) {
      return;
    } else {
      throw error;
    }
  });
}

/** Build the query for a filter. */
function getFilterQuery(filter: DittoFilter) {
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
        .where('tags.value_1', 'in', value) as typeof query;
    }
  }

  if (filter.local) {
    query = query.innerJoin('users', 'users.pubkey', 'events.pubkey');
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
    .map(getFilterQuery)
    .reduce((result, query) => result.union(query));
}

/** Get events for filters from the database. */
async function getFilters<K extends number>(
  filters: DittoFilter<K>[],
  opts: GetFiltersOpts = {},
): Promise<Event<K>[]> {
  if (!filters.length) return Promise.resolve([]);
  let query = getFiltersQuery(filters);

  if (typeof opts.limit === 'number') {
    query = query.limit(opts.limit);
  }

  return (await query.execute()).map((event) => (
    { ...event, tags: JSON.parse(event.tags) } as Event<K>
  ));
}

/** Delete events based on filters from the database. */
function deleteFilters<K extends number>(filters: DittoFilter<K>[]) {
  if (!filters.length) return Promise.resolve();
  const query = getFiltersQuery(filters);

  return db
    .deleteFrom('events')
    .where('id', 'in', () => query.clearSelect().select('id'))
    .execute();
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

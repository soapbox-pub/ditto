import { db, type TagRow } from '@/db.ts';
import { type Event, type Insertable } from '@/deps.ts';

import type { DittoFilter, GetFiltersOpts } from '@/types.ts';

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
      .executeTakeFirst();

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

    await trx.insertInto('tags')
      .values(tags)
      .execute();
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

  for (const key of Object.keys(filter)) {
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

  return query;
}

/** Get events for filters from the database. */
async function getFilters<K extends number>(
  filters: DittoFilter<K>[],
  opts: GetFiltersOpts = {},
): Promise<Event<K>[]> {
  let query = filters.map(getFilterQuery).reduce((acc, curr) => acc.union(curr));

  if (typeof opts.limit === 'number') {
    query = query.limit(opts.limit);
  }

  return (await query.execute()).map((event) => (
    { ...event, tags: JSON.parse(event.tags) } as Event<K>
  ));
}

export { getFilters, insertEvent };

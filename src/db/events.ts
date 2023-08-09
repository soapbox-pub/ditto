import { type Filter, type Insertable } from '@/deps.ts';
import { type SignedEvent } from '@/event.ts';

import { db, type TagRow } from '@/db.ts';

function insertEvent(event: SignedEvent): Promise<void> {
  return db.transaction().execute(async (trx) => {
    await trx.insertInto('events')
      .values({
        ...event,
        tags: JSON.stringify(event.tags),
      })
      .executeTakeFirst();

    const tags = event.tags.reduce<Insertable<TagRow>[]>((results, tag) => {
      if (['p', 'e', 'q', 'd', 't', 'proxy'].includes(tag[0])) {
        results.push({
          event_id: event.id,
          tag: tag[0],
          value_1: tag[1] || null,
          value_2: tag[2] || null,
          value_3: tag[3] || null,
        });
      }

      return results;
    }, []);

    await Promise.all(tags.map((tag) => {
      return trx.insertInto('tags')
        .values(tag)
        .execute();
    }));
  });
}

function getFilterQuery(filter: Filter) {
  let query = db.selectFrom('events').selectAll().orderBy('created_at', 'desc');

  for (const key of Object.keys(filter)) {
    switch (key as keyof Filter) {
      case 'ids':
        query = query.where('id', 'in', filter.ids!);
        break;
      case 'kinds':
        query = query.where('kind', 'in', filter.kinds!);
        break;
      case 'authors':
        query = query.where('pubkey', 'in', filter.authors!);
        break;
      case 'since':
        query = query.where('created_at', '>=', filter.since!);
        break;
      case 'until':
        query = query.where('created_at', '<=', filter.until!);
        break;
      case 'limit':
        query = query.limit(filter.limit!);
        break;
    }

    if (key.startsWith('#')) {
      const tag = key.replace(/^#/, '');
      const value = filter[key as `#${string}`] as string[];
      return query
        .leftJoin('tags', 'tags.event_id', 'events.id')
        .where('tags.tag', '=', tag)
        .where('tags.value_1', 'in', value);
    }
  }

  return query;
}

async function getFilters<K extends number>(filters: [Filter<K>]): Promise<SignedEvent<K>[]>;
async function getFilters(filters: Filter[]): Promise<SignedEvent[]>;
async function getFilters(filters: Filter[]) {
  const queries = filters
    .map(getFilterQuery)
    .map((query) => query.execute());

  const events = (await Promise.all(queries)).flat();

  return events.map((event) => (
    { ...event, tags: JSON.parse(event.tags) }
  ));
}

function getFilter<K extends number = number>(filter: Filter<K>): Promise<SignedEvent<K>[]> {
  return getFilters<K>([filter]);
}

async function isFollowed({ pubkey }: SignedEvent): Promise<boolean> {
  const event = await getFilterQuery({ kinds: [3], '#p': [pubkey], limit: 1 })
    .innerJoin('users', 'users.pubkey', 'events.pubkey')
    .executeTakeFirst();

  return !!event;
}

export { getFilter, getFilters, insertEvent, isFollowed };

import { type Filter, type Insertable } from '@/deps.ts';
import { type SignedEvent } from '@/event.ts';

import { db, type TagRow } from '../db.ts';

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

function getFilter<K extends number = number>(_filter: Filter<K>) {
  // TODO
}

export { getFilter, insertEvent };

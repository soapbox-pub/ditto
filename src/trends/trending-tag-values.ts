import { NostrFilter } from '@nostrify/nostrify';
import { Kysely } from 'kysely';

import { DittoTables } from '@/db/DittoTables.ts';

/** Get trending tag values for a given tag in the given time frame. */
export async function getTrendingTagValues(
  /** Kysely instance to execute queries on. */
  kysely: Kysely<DittoTables>,
  /** Tag name to filter by, eg `t` or `r`. */
  tagNames: string[],
  /** Filter of eligible events. */
  filter: NostrFilter,
): Promise<{ value: string; authors: number; uses: number }[]> {
  let query = kysely
    .selectFrom('nostr_tags')
    .innerJoin('nostr_events', 'nostr_events.id', 'nostr_tags.event_id')
    .select(({ fn }) => [
      'nostr_tags.value',
      fn.agg<number>('count', ['nostr_events.pubkey']).distinct().as('authors'),
      fn.countAll<number>().as('uses'),
    ])
    .where('nostr_tags.name', 'in', tagNames)
    .groupBy('nostr_tags.value')
    .orderBy((c) => c.fn.agg('count', ['nostr_events.pubkey']).distinct(), 'desc');

  if (filter.kinds) {
    query = query.where('nostr_events.kind', 'in', filter.kinds);
  }
  if (typeof filter.since === 'number') {
    query = query.where('nostr_events.created_at', '>=', filter.since);
  }
  if (typeof filter.until === 'number') {
    query = query.where('nostr_events.created_at', '<=', filter.until);
  }
  if (typeof filter.limit === 'number') {
    query = query.limit(filter.limit);
  }

  const rows = await query.execute();

  return rows.map((row) => ({
    value: row.value,
    authors: Number(row.authors),
    uses: Number(row.uses),
  }));
}

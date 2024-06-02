import { NostrEvent, NostrFilter } from '@nostrify/nostrify';
import { Kysely, sql } from 'kysely';

import { DittoTables } from '@/db/DittoTables.ts';

/**
 * Make a direct query to the database to get trending events within the specified timeframe.
 * Trending events are determined by the number of reposts, replies, and reactions.
 *
 * This query makes use of cached stats (in the `event_stats` table).
 * The query is SLOW so it needs to be run on a schedule and cached.
 */
export async function getTrendingEvents(
  /** Kysely instance to execute queries on. */
  kysely: Kysely<DittoTables>,
  /** Filter of eligible events. */
  filter: NostrFilter,
): Promise<NostrEvent[]> {
  let query = kysely
    .selectFrom('nostr_events')
    .selectAll('nostr_events')
    .innerJoin('event_stats', 'event_stats.event_id', 'nostr_events.id')
    .orderBy(
      sql`(event_stats.reposts_count * 2) + (event_stats.replies_count) + (event_stats.reactions_count)`,
      'desc',
    );

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
    ...row,
    tags: JSON.parse(row.tags),
  }));
}

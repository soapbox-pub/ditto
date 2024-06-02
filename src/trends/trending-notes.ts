import { NostrEvent } from '@nostrify/nostrify';
import { Kysely, sql } from 'kysely';

import { DittoTables } from '@/db/DittoTables.ts';

/**
 * Make a direct query to the database to get trending kind 1 notes within the specified timeframe.
 *
 * This query makes use of cached stats (in the `event_stats` table).
 * The query is SLOW so it needs to be run on a schedule and cached.
 */
export async function getTrendingNotes(
  /** Kysely instance to execute queries on. */
  kysely: Kysely<DittoTables>,
  /** Unix timestamp in _seconds_ for the starting point of this query. */
  since: number,
  /** Maximum number of trending notes to return. */
  limit: number,
): Promise<NostrEvent[]> {
  const rows = await kysely
    .selectFrom('nostr_events')
    .selectAll('nostr_events')
    .innerJoin('event_stats', 'event_stats.event_id', 'nostr_events.id')
    .where('nostr_events.kind', '=', 1)
    .where('nostr_events.created_at', '>', since)
    .orderBy(
      sql`(event_stats.reposts_count * 2) + (event_stats.replies_count) + (event_stats.reactions_count)`,
      'desc',
    )
    .limit(limit)
    .execute();

  return rows.map((row) => ({
    ...row,
    tags: JSON.parse(row.tags),
  }));
}

import { Kysely } from 'kysely';

import { DittoTables } from '@/db/DittoTables.ts';

interface GetTrendingHashtagsOpts {
  /** Unix timestamp in _seconds_ for the starting point of this query. */
  since: number;
  /** Maximum number of trending hashtags to return. */
  limit: number;
  /** Minimum number of unique accounts that have used a hashtag to be considered trending. */
  threshold: number;
}

/** Get the trending hashtags in the given time frame. */
export async function getTrendingHashtags(
  /** Kysely instance to execute queries on. */
  kysely: Kysely<DittoTables>,
  /** Options for this query. */
  opts: GetTrendingHashtagsOpts,
): Promise<{ tag: string; accounts: number; uses: number }[]> {
  const { since, limit, threshold } = opts;

  return await kysely
    .selectFrom('nostr_tags')
    .innerJoin('nostr_events', 'nostr_events.id', 'nostr_tags.event_id')
    .select(({ fn }) => [
      'nostr_tags.value as tag',
      fn.agg<number>('count', ['nostr_events.pubkey']).distinct().as('accounts'),
      fn.countAll<number>().as('uses'),
    ])
    .where('nostr_tags.name', '=', 't')
    .where('nostr_events.created_at', '>', since)
    .groupBy('nostr_tags.value')
    .having((c) => c(c.fn.agg('count', ['nostr_events.pubkey']).distinct(), '>=', threshold))
    .orderBy((c) => c.fn.agg('count', ['nostr_events.pubkey']).distinct(), 'desc')
    .limit(limit)
    .execute();
}

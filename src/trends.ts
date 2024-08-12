import { NostrFilter } from '@nostrify/nostrify';
import { Stickynotes } from '@soapbox/stickynotes';
import { sql } from 'kysely';

import { Conf } from '@/config.ts';
import { DittoDatabase, DittoDB } from '@/db/DittoDB.ts';
import { handleEvent } from '@/pipeline.ts';
import { AdminSigner } from '@/signers/AdminSigner.ts';
import { Time } from '@/utils/time.ts';

const console = new Stickynotes('ditto:trends');

/** Get trending tag values for a given tag in the given time frame. */
export async function getTrendingTagValues(
  /** Kysely instance to execute queries on. */
  { dialect, kysely }: DittoDatabase,
  /** Tag name to filter by, eg `t` or `r`. */
  tagNames: string[],
  /** Filter of eligible events. */
  filter: NostrFilter,
): Promise<{ value: string; authors: number; uses: number }[]> {
  if (dialect === 'postgres') {
    const { rows } = await sql<{ value: string; authors: number; uses: number }>`
      SELECT
          LOWER(element.value) AS value,
          COUNT(DISTINCT nostr_events.pubkey) AS authors,
          COUNT(*) as "uses"
      FROM
          nostr_events,
          jsonb_each_text(nostr_events.tags_index) kv,
          jsonb_array_elements_text(kv.value::jsonb) element
      WHERE
          kv.key = ANY(${tagNames})
          ${filter.kinds ? sql`AND nostr_events.kind = ANY(${filter.kinds})` : sql``}
          ${typeof filter.since === 'number' ? sql`AND nostr_events.created_at >= ${filter.since}` : sql``}
          ${typeof filter.until === 'number' ? sql`AND nostr_events.created_at <= ${filter.until}` : sql``}
      GROUP BY
          LOWER(element.value)
      ORDER BY
          COUNT(DISTINCT nostr_events.pubkey) DESC
      ${typeof filter.limit === 'number' ? sql`LIMIT ${filter.limit}` : sql``};`
      .execute(kysely);

    return rows.map((row) => ({
      value: row.value,
      authors: Number(row.authors),
      uses: Number(row.uses),
    }));
  }

  if (dialect === 'sqlite') {
    let query = kysely
      .selectFrom('nostr_tags')
      .select(({ fn }) => [
        'nostr_tags.value',
        fn.agg<number>('count', ['nostr_tags.pubkey']).distinct().as('authors'),
        fn.countAll<number>().as('uses'),
      ])
      .where('nostr_tags.name', 'in', tagNames)
      .groupBy('nostr_tags.value')
      .orderBy((c) => c.fn.agg('count', ['nostr_tags.pubkey']).distinct(), 'desc');

    if (filter.kinds) {
      query = query.where('nostr_tags.kind', 'in', filter.kinds);
    }
    if (typeof filter.since === 'number') {
      query = query.where('nostr_tags.created_at', '>=', filter.since);
    }
    if (typeof filter.until === 'number') {
      query = query.where('nostr_tags.created_at', '<=', filter.until);
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

  return [];
}

/** Get trending tags and publish an event with them. */
export async function updateTrendingTags(
  l: string,
  tagName: string,
  kinds: number[],
  limit: number,
  extra = '',
  aliases?: string[],
) {
  console.info(`Updating trending ${l}...`);
  const db = await DittoDB.getInstance();
  const signal = AbortSignal.timeout(1000);

  const yesterday = Math.floor((Date.now() - Time.days(1)) / 1000);
  const now = Math.floor(Date.now() / 1000);

  const tagNames = aliases ? [tagName, ...aliases] : [tagName];

  try {
    const trends = await getTrendingTagValues(db, tagNames, {
      kinds,
      since: yesterday,
      until: now,
      limit,
    });

    if (!trends.length) {
      console.info(`No trending ${l} found. Skipping.`);
      return;
    }

    const signer = new AdminSigner();

    const label = await signer.signEvent({
      kind: 1985,
      content: '',
      tags: [
        ['L', 'pub.ditto.trends'],
        ['l', l, 'pub.ditto.trends'],
        ...trends.map(({ value, authors, uses }) => [tagName, value, extra, authors.toString(), uses.toString()]),
      ],
      created_at: Math.floor(Date.now() / 1000),
    });

    await handleEvent(label, signal);
    console.info(`Trending ${l} updated.`);
  } catch (e) {
    console.error(`Error updating trending ${l}: ${e.message}`);
  }
}

/** Update trending pubkeys. */
export function updateTrendingPubkeys(): Promise<void> {
  return updateTrendingTags('#p', 'p', [1, 3, 6, 7, 9735], 40, Conf.relay);
}

/** Update trending zapped events. */
export function updateTrendingZappedEvents(): Promise<void> {
  return updateTrendingTags('zapped', 'e', [9735], 40, Conf.relay, ['q']);
}

/** Update trending events. */
export function updateTrendingEvents(): Promise<void> {
  return updateTrendingTags('#e', 'e', [1, 6, 7, 9735], 40, Conf.relay, ['q']);
}

/** Update trending hashtags. */
export function updateTrendingHashtags(): Promise<void> {
  return updateTrendingTags('#t', 't', [1], 20);
}

/** Update trending links. */
export function updateTrendingLinks(): Promise<void> {
  return updateTrendingTags('#r', 'r', [1], 20);
}

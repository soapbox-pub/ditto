import { DittoTables } from '@ditto/db';
import { NostrFilter } from '@nostrify/nostrify';
import { logi } from '@soapbox/logi';
import { Kysely, sql } from 'kysely';

import { Conf } from '@/config.ts';
import { handleEvent } from '@/pipeline.ts';
import { AdminSigner } from '@/signers/AdminSigner.ts';
import { Storages } from '@/storages.ts';
import { errorJson } from '@/utils/log.ts';
import { Time } from '@/utils/time.ts';

/** Get trending tag values for a given tag in the given time frame. */
export async function getTrendingTagValues(
  /** Kysely instance to execute queries on. */
  kysely: Kysely<DittoTables>,
  /** Tag name to filter by, eg `t` or `r`. */
  tagNames: string[],
  /** Filter of eligible events. */
  filter: NostrFilter,
  /** If present, only tag values in this list are permitted to trend. */
  values?: string[],
): Promise<{ value: string; authors: number; uses: number }[]> {
  let query = kysely
    .selectFrom([
      'nostr_events',
      sql<{ key: string; value: string }>`jsonb_each_text(nostr_events.tags_index)`.as('kv'),
      sql<{ key: string; value: string }>`jsonb_array_elements_text(kv.value::jsonb)`.as('element'),
    ])
    .select(({ fn }) => [
      fn<string>('lower', ['element.value']).as('value'),
      fn.agg<number>('count', ['nostr_events.pubkey']).distinct().as('authors'),
      fn.countAll<number>().as('uses'),
    ])
    .where('kv.key', '=', (eb) => eb.fn.any(eb.val(tagNames)))
    .groupBy((eb) => eb.fn<string>('lower', ['element.value']))
    .orderBy('authors desc').orderBy('uses desc');

  if (filter.kinds) {
    query = query.where('nostr_events.kind', '=', ({ fn, val }) => fn.any(val(filter.kinds)));
  }
  if (filter.authors) {
    query = query.where('nostr_events.pubkey', '=', ({ fn, val }) => fn.any(val(filter.authors)));
  }
  if (typeof filter.since === 'number') {
    query = query.where('nostr_events.created_at', '>=', filter.since);
  }
  if (typeof filter.until === 'number') {
    query = query.where('nostr_events.created_at', '<=', filter.until);
  }
  if (values) {
    query = query.where('element.value', 'in', values);
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

/** Get trending tags and publish an event with them. */
export async function updateTrendingTags(
  l: string,
  tagName: string,
  kinds: number[],
  limit: number,
  extra = '',
  aliases?: string[],
  values?: string[],
) {
  const params = { l, tagName, kinds, limit, extra, aliases, values };
  logi({ level: 'info', ns: 'ditto.trends', msg: 'Updating trending', ...params });

  const kysely = await Storages.kysely();
  const signal = AbortSignal.timeout(1000);

  const yesterday = Math.floor((Date.now() - Time.days(1)) / 1000);
  const now = Math.floor(Date.now() / 1000);

  const tagNames = aliases ? [tagName, ...aliases] : [tagName];

  try {
    const trends = await getTrendingTagValues(kysely, tagNames, {
      kinds,
      since: yesterday,
      until: now,
      limit,
    }, values);

    if (trends.length) {
      logi({ level: 'info', ns: 'ditto.trends', msg: 'Trends found', trends, ...params });
    } else {
      logi({ level: 'info', ns: 'ditto.trends', msg: 'No trends found. Skipping.', ...params });
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

    await handleEvent(label, { source: 'internal', signal });
    logi({ level: 'info', ns: 'ditto.trends', msg: 'Trends updated', ...params });
  } catch (e) {
    logi({ level: 'error', ns: 'ditto.trends', msg: 'Error updating trends', ...params, error: errorJson(e) });
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
export async function updateTrendingEvents(): Promise<void> {
  const results: Promise<void>[] = [
    updateTrendingTags('#e', 'e', [1, 6, 7, 9735], 40, Conf.relay, ['q']),
  ];

  const kysely = await Storages.kysely();

  for (const language of Conf.preferredLanguages ?? []) {
    const yesterday = Math.floor((Date.now() - Time.days(1)) / 1000);
    const now = Math.floor(Date.now() / 1000);

    const rows = await kysely
      .selectFrom('nostr_events')
      .select('nostr_events.id')
      .where(sql`nostr_events.search_ext->>'language'`, '=', language)
      .where('nostr_events.created_at', '>=', yesterday)
      .where('nostr_events.created_at', '<=', now)
      .execute();

    const ids = rows.map((row) => row.id);

    results.push(updateTrendingTags(`#e.${language}`, 'e', [1, 6, 7, 9735], 40, Conf.relay, ['q'], ids));
  }

  await Promise.allSettled(results);
}

/** Update trending hashtags. */
export function updateTrendingHashtags(): Promise<void> {
  return updateTrendingTags('#t', 't', [1], 20);
}

/** Update trending links. */
export function updateTrendingLinks(): Promise<void> {
  return updateTrendingTags('#r', 'r', [1], 20);
}

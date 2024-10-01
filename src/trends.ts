import { LanguageCode } from 'iso-639-1';
import { NostrEvent, NostrFilter } from '@nostrify/nostrify';
import { Stickynotes } from '@soapbox/stickynotes';
import { Kysely, sql } from 'kysely';

import { Conf } from '@/config.ts';
import { DittoTables } from '@/db/DittoTables.ts';
import { handleEvent } from '@/pipeline.ts';
import { AdminSigner } from '@/signers/AdminSigner.ts';
import { Storages } from '@/storages.ts';
import { Time } from '@/utils/time.ts';

const console = new Stickynotes('ditto:trends');

/** Get trending tag values for a given tag in the given time frame. */
export async function getTrendingTagValues(
  /** Kysely instance to execute queries on. */
  kysely: Kysely<DittoTables>,
  /** Tag name to filter by, eg `t` or `r`. */
  tagNames: string[],
  /** Filter of eligible events. */
  filter: NostrFilter,
  /** Results must be inside 'languagesIds' */
  languagesIds?: string[],
): Promise<{ value: string; authors: number; uses: number }[]> {
  let query = kysely.with('trends', (db) => {
    let query = db
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
      .orderBy((eb) => eb.fn.agg('count', ['nostr_events.pubkey']).distinct(), 'desc');

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
    return query;
  })
    .selectFrom(['trends'])
    .select(['value', 'authors', 'uses']);

  if (languagesIds) {
    query = query.where('trends.value', 'in', languagesIds);
  }

  query = query.orderBy('authors desc').orderBy('uses desc');

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
  language?: LanguageCode,
) {
  console.info(`Updating trending ${l}...`);
  const kysely = await Storages.kysely();
  const signal = AbortSignal.timeout(1000);

  const yesterday = Math.floor((Date.now() - Time.days(1)) / 1000);
  const now = Math.floor(Date.now() / 1000);

  const tagNames = aliases ? [tagName, ...aliases] : [tagName];

  let languagesIds: NostrEvent['id'][] = [];
  if (language) {
    const result = (await kysely.selectFrom('nostr_events')
      .select('id')
      .where('language', '=', language)
      .where('nostr_events.created_at', '>=', yesterday)
      .where('nostr_events.created_at', '<=', now)
      .execute()).map((event) => event.id);
    languagesIds = result;
  }

  try {
    const trends = await getTrendingTagValues(kysely, tagNames, {
      kinds,
      since: yesterday,
      until: now,
      limit,
    }, languagesIds);

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
        ['l', languagesIds.length ? `${l}.${language}` : l, 'pub.ditto.trends'],
        ...trends.map(({ value, authors, uses }) => [tagName, value, extra, authors.toString(), uses.toString()]),
      ],
      created_at: Math.floor(Date.now() / 1000),
    });

    await handleEvent(label, signal);
    console.info(`Trending ${l} updated.`);
  } catch (e: any) {
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
export async function updateTrendingEvents(): Promise<void> {
  const languages = Conf.preferredLanguages;
  if (!languages) return updateTrendingTags('#e', 'e', [1, 6, 7, 9735], 40, Conf.relay, ['q']);

  const promise: Promise<void>[] = [];

  for (const language of languages) {
    promise.push(updateTrendingTags('#e', 'e', [1, 6, 7, 9735], 40, Conf.relay, ['q'], language));
  }

  await Promise.allSettled(promise);
}

/** Update trending hashtags. */
export function updateTrendingHashtags(): Promise<void> {
  return updateTrendingTags('#t', 't', [1], 20);
}

/** Update trending links. */
export function updateTrendingLinks(): Promise<void> {
  return updateTrendingTags('#r', 'r', [1], 20);
}

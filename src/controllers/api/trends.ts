import { NostrEvent } from '@nostrify/nostrify';
import { sql } from 'kysely';
import { z } from 'zod';

import { type AppController } from '@/app.ts';
import { Conf } from '@/config.ts';
import { DittoDB } from '@/db/DittoDB.ts';
import { hydrateEvents } from '@/storages/hydrate.ts';
import { Storages } from '@/storages.ts';
import { Time } from '@/utils.ts';
import { stripTime } from '@/utils/time.ts';
import { renderStatus } from '@/views/mastodon/statuses.ts';
import { TrendsWorker } from '@/workers/trends.ts';

await TrendsWorker.open('data/trends.sqlite3');

const limitSchema = z.coerce.number().catch(10).transform((value) => Math.min(Math.max(value, 0), 20));

let trendingHashtagsCache = getTrendingHashtags();

Deno.cron('update trends cache', { minute: { every: 15 } }, async () => {
  const trends = await getTrendingHashtags();
  trendingHashtagsCache = Promise.resolve(trends);
});

const trendingTagsController: AppController = async (c) => {
  const limit = limitSchema.parse(c.req.query('limit'));
  const trends = await trendingHashtagsCache;
  return c.json(trends.slice(0, limit));
};

async function getTrendingHashtags() {
  const now = new Date();
  const yesterday = new Date(now.getTime() - Time.days(1));
  const lastWeek = new Date(now.getTime() - Time.days(7));

  /** Most used hashtags within the past 24h. */
  const tags = await TrendsWorker.getTrendingTags({
    since: yesterday,
    until: now,
    limit: 20,
  });

  return Promise.all(tags.map(async ({ tag, uses, accounts }) => ({
    name: tag,
    url: Conf.local(`/tags/${tag}`),
    history: [
      // Use the full 24h query for the current day. Then use `offset: 1` to adjust for this below.
      // This result is more accurate than what Mastodon returns.
      {
        day: String(Math.floor(stripTime(now).getTime() / 1000)),
        accounts: String(accounts),
        uses: String(uses),
      },
      ...(await TrendsWorker.getTagHistory({
        tag,
        since: lastWeek,
        until: now,
        limit: 6,
        offset: 1,
      })).map((history) => ({
        // For some reason, Mastodon wants these to be strings... oh well.
        day: String(Math.floor(history.day.getTime() / 1000)),
        accounts: String(history.accounts),
        uses: String(history.uses),
      })),
    ],
  })));
}

let trendingNotesCache = getTrendingNotes();

Deno.cron('update trending notes cache', { minute: { every: 15 } }, async () => {
  const events = await getTrendingNotes();
  trendingNotesCache = Promise.resolve(events);
});

const trendingStatusesController: AppController = async (c) => {
  const store = await Storages.db();
  const limit = limitSchema.parse(c.req.query('limit'));

  const events = await trendingNotesCache
    .then((events) => events.slice(0, limit))
    .then((events) => hydrateEvents({ events, store }));

  const statuses = await Promise.all(
    events.map((event) => renderStatus(event, {})),
  );

  return c.json(statuses.filter(Boolean));
};

async function getTrendingNotes(): Promise<NostrEvent[]> {
  const store = await Storages.db();
  const kysely = await DittoDB.getInstance();
  const since = Math.floor((Date.now() - Time.days(1)) / 1000);

  const tags = await kysely
    .selectFrom('nostr_tags')
    .select('nostr_tags.value')
    .leftJoin('nostr_events', 'nostr_events.id', 'nostr_tags.event_id')
    .where('nostr_events.kind', 'in', [1, 6, 7])
    .where('nostr_events.created_at', '>', since)
    .where('nostr_tags.name', '=', 'e')
    .groupBy('nostr_tags.value')
    .orderBy(
      sql`SUM(case when nostr_events.kind = 6 then 2 else 0 end) + SUM(case when nostr_events.kind = 1 or nostr_events.kind = 7 then 1 else 0 end)`,
      'desc',
    )
    .limit(20)
    .execute();

  const ids = tags.map(({ value }) => value);
  return store.query([{ kinds: [1], ids, limit: ids.length }]);
}

export { trendingStatusesController, trendingTagsController };

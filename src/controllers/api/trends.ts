import { NostrEvent } from '@nostrify/nostrify';
import { z } from 'zod';

import { type AppController } from '@/app.ts';
import { Conf } from '@/config.ts';
import { hydrateEvents } from '@/storages/hydrate.ts';
import { Storages } from '@/storages.ts';
import { Time } from '@/utils.ts';
import { stripTime } from '@/utils/time.ts';
import { renderStatus } from '@/views/mastodon/statuses.ts';
import { TrendsWorker } from '@/workers/trends.ts';

await TrendsWorker.open('data/trends.sqlite3');

let trendingHashtagsCache = getTrendingHashtags();

Deno.cron('update trends cache', { minute: { every: 15 } }, async () => {
  const trends = await getTrendingHashtags();
  trendingHashtagsCache = Promise.resolve(trends);
});

const trendingTagsQuerySchema = z.object({
  limit: z.coerce.number().catch(10).transform((value) => Math.min(Math.max(value, 0), 20)),
  offset: z.number().nonnegative().catch(0),
});

const trendingTagsController: AppController = async (c) => {
  const { limit, offset } = trendingTagsQuerySchema.parse(c.req.query());
  const trends = await trendingHashtagsCache;
  return c.json(trends.slice(offset, offset + limit));
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

const trendingStatusesQuerySchema = z.object({
  limit: z.coerce.number().catch(20).transform((value) => Math.min(Math.max(value, 0), 40)),
  offset: z.number().nonnegative().catch(0),
});

const trendingStatusesController: AppController = async (c) => {
  const store = await Storages.db();
  const { limit, offset } = trendingStatusesQuerySchema.parse(c.req.query());

  const [label] = await store.query([{
    kinds: [1985],
    '#L': ['pub.ditto.trends'],
    '#l': ['notes'],
    authors: [Conf.pubkey],
    limit: 1,
  }]);

  const ids = (label?.tags ?? [])
    .filter(([name]) => name === 'e')
    .map(([, id]) => id)
    .slice(offset, offset + limit);

  if (!ids.length) {
    return c.json([]);
  }

  const results = await store.query([{ ids }])
    .then((events) => hydrateEvents({ events, store }));

  // Sort events in the order they appear in the label.
  const events = ids
    .map((id) => results.find((event) => event.id === id))
    .filter((event): event is NostrEvent => !!event);

  const statuses = await Promise.all(
    events.map((event) => renderStatus(event, {})),
  );

  return c.json(statuses.filter(Boolean));
};

export { trendingStatusesController, trendingTagsController };

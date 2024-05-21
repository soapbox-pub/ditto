import { z } from 'zod';

import { type AppController } from '@/app.ts';
import { Conf } from '@/config.ts';
import { Time } from '@/utils.ts';
import { stripTime } from '@/utils/time.ts';
import { TrendsWorker } from '@/workers/trends.ts';

await TrendsWorker.open('data/trends.sqlite3');

const limitSchema = z.coerce.number().catch(10).transform((value) => Math.min(Math.max(value, 0), 20));

let cache = getTrends();

Deno.cron('update trends cache', { minute: { every: 15 } }, async () => {
  const trends = await getTrends();
  cache = Promise.resolve(trends);
});

const trendingTagsController: AppController = async (c) => {
  const limit = limitSchema.parse(c.req.query('limit'));
  const trends = await cache;
  return c.json(trends.slice(0, limit));
};

async function getTrends() {
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

export { trendingTagsController };

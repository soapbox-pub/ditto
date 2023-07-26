import { type AppController } from '@/app.ts';
import { Conf } from '@/config.ts';
import { z } from '@/deps.ts';
import { trends } from '@/trends.ts';
import { Time } from '@/utils.ts';
import { stripTime } from '@/utils/time.ts';

const limitSchema = z.coerce.number().catch(10).transform((value) => Math.min(Math.max(value, 0), 20));

const trendingTagsController: AppController = (c) => {
  const limit = limitSchema.parse(c.req.query('limit'));
  if (limit < 1) return c.json([]);

  const now = new Date();
  const yesterday = new Date(now.getTime() - Time.days(1));
  const lastWeek = new Date(now.getTime() - Time.days(7));

  /** Most used hashtags within the past 24h. */
  const tags = trends.getTrendingTags({
    since: yesterday,
    until: now,
    limit,
  });

  return c.json(tags.map(({ name, uses, accounts }) => ({
    name,
    url: Conf.local(`/tags/${name}`),
    history: [
      // Use the full 24h query for the current day. Then use `offset: 1` to adjust for this below.
      // This result is more accurate than what Mastodon returns.
      {
        day: String(Math.floor(stripTime(now).getTime() / 1000)),
        accounts: String(accounts),
        uses: String(uses),
      },
      ...trends.getTagHistory({
        tag: name,
        since: lastWeek,
        until: now,
        limit: 6,
        offset: 1,
      }).map((history) => ({
        // For some reason, Mastodon wants these to be strings... oh well.
        day: String(Math.floor(history.day.getTime() / 1000)),
        accounts: String(history.accounts),
        uses: String(history.uses),
      })),
    ],
  })));
};

export { trendingTagsController };

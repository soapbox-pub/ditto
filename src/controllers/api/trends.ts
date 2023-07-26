import { type AppController } from '@/app.ts';
import { Conf } from '@/config.ts';
import { z } from '@/deps.ts';
import { trends } from '@/trends.ts';
import { Time } from '@/utils.ts';

const limitSchema = z.coerce.number().catch(10).transform((value) => Math.min(Math.max(value, 0), 20));

const trendingTagsController: AppController = (c) => {
  const limit = limitSchema.parse(c.req.query('limit'));
  if (limit < 1) return c.json([]);

  const now = new Date();
  const yesterday = new Date(now.getTime() - Time.days(1));
  const lastWeek = new Date(now.getTime() - Time.days(7));

  const tags = trends.getTrendingTags({
    since: yesterday,
    until: now,
    limit,
  });

  return c.json(tags.map(({ name, uses, accounts }) => ({
    name,
    url: Conf.local(`/tags/${name}`),
    history: [
      {
        day: String(Math.floor(now.getTime() / 1000)),
        accounts: String(accounts),
        uses: String(uses),
      },
      ...getTagHistoryWithGapsFilled({
        tag: name,
        since: lastWeek,
        until: now,
        limit: 6,
        offset: 1,
      }).map((history) => ({
        day: String(Math.floor(history.day.getTime() / 1000)),
        accounts: String(history.accounts),
        uses: String(history.uses),
      })),
    ],
  })));
};

function generateDateRange(since: Date, until: Date): Date[] {
  const dates = [];

  const sinceDate = new Date(Date.UTC(since.getUTCFullYear(), since.getUTCMonth(), since.getUTCDate() + 1));
  const untilDate = new Date(Date.UTC(until.getUTCFullYear(), until.getUTCMonth(), until.getUTCDate()));

  while (sinceDate < untilDate) {
    dates.push(new Date(sinceDate));
    sinceDate.setUTCDate(sinceDate.getUTCDate() + 1);
  }

  return dates.reverse();
}

function getTagHistoryWithGapsFilled(params: Parameters<typeof trends.getTagHistory>[0]) {
  const history = trends.getTagHistory(params);
  const dateRange = generateDateRange(params.since, params.until);

  return dateRange.map((day) => {
    const data = history.find((item) => item.day.getTime() === day.getTime());
    return data || { day, accounts: 0, uses: 0 };
  });
}

export { trendingTagsController };

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

  const tags = trends.getTrendingTags(yesterday, now, limit);

  return c.json(tags.map(({ name, accounts, uses }) => ({
    name,
    url: Conf.local(`/tags/${name}`),
    history: [{
      day: String(Math.floor(yesterday.getTime() / 1000)),
      uses: String(uses),
      accounts: String(accounts),
    }],
  })));
};

export { trendingTagsController };

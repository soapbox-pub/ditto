import { type AppController } from '@/app.ts';
import { Conf } from '@/config.ts';
import { trends } from '@/trends.ts';
import { Time } from '@/utils.ts';

const trendingTagsController: AppController = (c) => {
  const now = new Date();
  const yesterday = new Date(now.getTime() - Time.days(1));

  const tags = trends.getTrendingTags(yesterday, now);

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

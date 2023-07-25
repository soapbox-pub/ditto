import { type AppController } from '@/app.ts';
import { Conf } from '@/config.ts';
import { trends } from '@/trends.ts';
import { Time } from '@/utils.ts';

const trendingTagsController: AppController = (c) => {
  const yesterday = new Date(new Date().getTime() - Time.days(1));
  const now = new Date();

  const tags = trends.getTrendingTags(yesterday, now);

  return c.json(tags.map(({ name, accounts }) => ({
    name,
    url: Conf.local(`/tags/${name}`),
    history: [{
      day: String(Math.floor(yesterday.getTime() / 1000)),
      uses: String(accounts), // Not actually true - we don't collect this
      accounts: String(accounts),
    }],
  })));
};

export { trendingTagsController };

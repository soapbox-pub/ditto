import { NostrEvent } from '@nostrify/nostrify';
import { z } from 'zod';

import { type AppController } from '@/app.ts';
import { Conf } from '@/config.ts';
import { hydrateEvents } from '@/storages/hydrate.ts';
import { Storages } from '@/storages.ts';
import { generateDateRange, Time } from '@/utils/time.ts';
import { renderStatus } from '@/views/mastodon/statuses.ts';

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
  const store = await Storages.db();

  const [label] = await store.query([{
    kinds: [1985],
    '#L': ['pub.ditto.trends'],
    '#l': ['#t'],
    authors: [Conf.pubkey],
    limit: 1,
  }]);

  if (!label) {
    return [];
  }

  const tags = label.tags.filter(([name]) => name === 't');

  const now = new Date();
  const lastWeek = new Date(now.getTime() - Time.days(7));
  const dates = generateDateRange(lastWeek, now);

  return Promise.all(tags.map(async ([_, hashtag]) => {
    const filters = dates.map((date) => ({
      kinds: [1985],
      '#L': ['pub.ditto.trends'],
      '#l': ['#t'],
      '#t': [hashtag],
      authors: [Conf.pubkey],
      since: Math.floor(date.getTime() / 1000),
      until: Math.floor((date.getTime() + Time.days(1)) / 1000),
      limit: 1,
    }));

    const labels = await store.query(filters);

    const history = dates.map((date) => {
      const label = labels.find((label) => {
        const since = Math.floor(date.getTime() / 1000);
        const until = Math.floor((date.getTime() + Time.days(1)) / 1000);
        return label.created_at >= since && label.created_at < until;
      });

      const [, , , accounts, uses] = label?.tags.find(([name, value]) => name === 't' && value === hashtag) ?? [];

      return {
        day: String(date.getTime() / 1000),
        accounts: accounts || '0',
        uses: uses || '0',
      };
    });

    return {
      name: hashtag,
      url: Conf.local(`/tags/${hashtag}`),
      history,
    };
  }));
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
    '#l': ['#e'],
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

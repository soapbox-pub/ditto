import { NostrEvent, NostrFilter, NStore } from '@nostrify/nostrify';
import { logi } from '@soapbox/logi';
import { z } from 'zod';

import { AppController } from '@/app.ts';
import { Conf } from '@/config.ts';
import { paginationSchema } from '@/schemas/pagination.ts';
import { hydrateEvents } from '@/storages/hydrate.ts';
import { Storages } from '@/storages.ts';
import { generateDateRange, Time } from '@/utils/time.ts';
import { unfurlCardCached } from '@/utils/unfurl.ts';
import { paginated } from '@/utils/api.ts';
import { errorJson } from '@/utils/log.ts';
import { renderStatus } from '@/views/mastodon/statuses.ts';

let trendingHashtagsCache = getTrendingHashtags().catch((e: unknown) => {
  logi({
    level: 'error',
    ns: 'ditto.trends.api',
    type: 'tags',
    message: 'Failed to get trending hashtags',
    error: errorJson(e),
  });
  return Promise.resolve([]);
});

Deno.cron('update trending hashtags cache', '35 * * * *', async () => {
  try {
    const trends = await getTrendingHashtags();
    trendingHashtagsCache = Promise.resolve(trends);
  } catch (e) {
    logi({
      level: 'error',
      ns: 'ditto.trends.api',
      type: 'tags',
      message: 'Failed to get trending hashtags',
      error: errorJson(e),
    });
  }
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
  const trends = await getTrendingTags(store, 't');

  return trends.map((trend) => {
    const hashtag = trend.value;

    const history = trend.history.map(({ day, authors, uses }) => ({
      day: String(day),
      accounts: String(authors),
      uses: String(uses),
    }));

    return {
      name: hashtag,
      url: Conf.local(`/tags/${hashtag}`),
      history,
    };
  });
}

let trendingLinksCache = getTrendingLinks().catch((e: unknown) => {
  logi({
    level: 'error',
    ns: 'ditto.trends.api',
    type: 'links',
    message: 'Failed to get trending links',
    error: errorJson(e),
  });
  return Promise.resolve([]);
});

Deno.cron('update trending links cache', '50 * * * *', async () => {
  try {
    const trends = await getTrendingLinks();
    trendingLinksCache = Promise.resolve(trends);
  } catch (e) {
    logi({
      level: 'error',
      ns: 'ditto.trends.api',
      type: 'links',
      message: 'Failed to get trending links',
      error: errorJson(e),
    });
  }
});

const trendingLinksController: AppController = async (c) => {
  const { limit, offset } = trendingTagsQuerySchema.parse(c.req.query());
  const trends = await trendingLinksCache;
  return c.json(trends.slice(offset, offset + limit));
};

async function getTrendingLinks() {
  const store = await Storages.db();
  const trends = await getTrendingTags(store, 'r');

  return Promise.all(trends.map(async (trend) => {
    const link = trend.value;
    const card = await unfurlCardCached(link);

    const history = trend.history.map(({ day, authors, uses }) => ({
      day: String(day),
      accounts: String(authors),
      uses: String(uses),
    }));

    return {
      url: link,
      title: '',
      description: '',
      type: 'link',
      author_name: '',
      author_url: '',
      provider_name: '',
      provider_url: '',
      html: '',
      width: 0,
      height: 0,
      image: null,
      embed_url: '',
      blurhash: null,
      ...card,
      history,
    };
  }));
}

const trendingStatusesController: AppController = async (c) => {
  const store = await Storages.db();
  const { limit, offset, until } = paginationSchema.parse(c.req.query());

  const [label] = await store.query([{
    kinds: [1985],
    '#L': ['pub.ditto.trends'],
    '#l': ['#e'],
    authors: [Conf.pubkey],
    until,
    limit: 1,
  }]);

  const ids = (label?.tags ?? [])
    .filter(([name]) => name === 'e')
    .map(([, id]) => id)
    .slice(offset, offset + limit);

  if (!ids.length) {
    return c.json([]);
  }

  const results = await store.query([{ kinds: [1, 20], ids }])
    .then((events) => hydrateEvents({ events, store }));

  // Sort events in the order they appear in the label.
  const events = ids
    .map((id) => results.find((event) => event.id === id))
    .filter((event): event is NostrEvent => !!event);

  const statuses = await Promise.all(
    events.map((event) => renderStatus(event, {})),
  );

  return paginated(c, results, statuses);
};

interface TrendingTag {
  name: string;
  value: string;
  history: {
    day: number;
    authors: number;
    uses: number;
  }[];
}

export async function getTrendingTags(store: NStore, tagName: string): Promise<TrendingTag[]> {
  const [label] = await store.query([{
    kinds: [1985],
    '#L': ['pub.ditto.trends'],
    '#l': [`#${tagName}`],
    authors: [Conf.pubkey],
    limit: 1,
  }]);

  if (!label) return [];

  const date = new Date(label.created_at * 1000);
  const lastWeek = new Date(date.getTime() - Time.days(7));
  const dates = generateDateRange(lastWeek, date).reverse();

  const results: TrendingTag[] = [];

  for (const [name, value] of label.tags) {
    if (name !== tagName) continue;

    const history: TrendingTag['history'] = [];

    for (const date of dates) {
      const [label] = await store.query([{
        kinds: [1985],
        '#L': ['pub.ditto.trends'],
        '#l': [`#${tagName}`],
        [`#${tagName}`]: [value],
        authors: [Conf.pubkey],
        since: Math.floor(date.getTime() / 1000),
        until: Math.floor((date.getTime() + Time.days(1)) / 1000),
        limit: 1,
      } as NostrFilter]);

      const [, , , accounts, uses] = label?.tags.find(([n, v]) => n === tagName && v === value) ?? [];

      history.push({
        day: Math.floor(date.getTime() / 1000),
        authors: Number(accounts || 0),
        uses: Number(uses || 0),
      });
    }

    results.push({
      name: tagName,
      value,
      history,
    });
  }

  return results;
}

export { trendingLinksController, trendingStatusesController, trendingTagsController };

import { type DittoConf } from '@ditto/conf';
import { paginated, paginationSchema } from '@ditto/mastoapi/pagination';
import { NostrEvent, NostrFilter, NStore } from '@nostrify/nostrify';
import { logi } from '@soapbox/logi';
import { z } from 'zod';

import { AppController } from '@/app.ts';
import { hydrateEvents } from '@/storages/hydrate.ts';
import { generateDateRange, Time } from '@/utils/time.ts';
import { errorJson } from '@/utils/log.ts';
import { renderStatus } from '@/views/mastodon/statuses.ts';

import type { MastodonPreviewCard } from '@ditto/mastoapi/types';

interface TrendHistory {
  day: string;
  accounts: string;
  uses: string;
}

interface TrendingHashtag {
  name: string;
  url: string;
  history: TrendHistory[];
}

interface TrendingLink extends MastodonPreviewCard {
  history: TrendHistory[];
}

const trendingTagsQuerySchema = z.object({
  limit: z.coerce.number().catch(10).transform((value) => Math.min(Math.max(value, 0), 20)),
  offset: z.number().nonnegative().catch(0),
});

const trendingTagsController: AppController = async (c) => {
  const { conf, relay } = c.var;
  const { limit, offset } = trendingTagsQuerySchema.parse(c.req.query());

  try {
    const trends = await getTrendingHashtags(conf, relay);
    return c.json(trends.slice(offset, offset + limit));
  } catch (e) {
    logi({
      level: 'error',
      ns: 'ditto.trends.api',
      type: 'tags',
      msg: 'Failed to get trending hashtags',
      error: errorJson(e),
    });
    return c.json([]);
  }
};

async function getTrendingHashtags(conf: DittoConf, relay: NStore): Promise<TrendingHashtag[]> {
  const trends = await getTrendingTags(relay, 't', await conf.signer.getPublicKey());

  return trends.map((trend) => {
    const hashtag = trend.value;

    const history = trend.history.map(({ day, authors, uses }) => ({
      day: String(day),
      accounts: String(authors),
      uses: String(uses),
    }));

    return {
      name: hashtag,
      url: conf.local(`/tags/${hashtag}`),
      history,
    };
  });
}

const trendingLinksController: AppController = async (c) => {
  const { conf, relay } = c.var;
  const { limit, offset } = trendingTagsQuerySchema.parse(c.req.query());
  try {
    const trends = await getTrendingLinks(conf, relay);
    return c.json(trends.slice(offset, offset + limit));
  } catch (e) {
    logi({
      level: 'error',
      ns: 'ditto.trends.api',
      type: 'links',
      msg: 'Failed to get trending links',
      error: errorJson(e),
    });
    return c.json([]);
  }
};

async function getTrendingLinks(conf: DittoConf, relay: NStore): Promise<TrendingLink[]> {
  const trends = await getTrendingTags(relay, 'r', await conf.signer.getPublicKey());

  return Promise.all(trends.map((trend) => {
    const link = trend.value;

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
      history,
    };
  }));
}

const trendingStatusesController: AppController = async (c) => {
  const { conf, relay } = c.var;
  const { limit, offset, until } = paginationSchema().parse(c.req.query());

  const [label] = await relay.query([{
    kinds: [1985],
    '#L': ['pub.ditto.trends'],
    '#l': ['#e'],
    authors: [await conf.signer.getPublicKey()],
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

  const results = await relay.query([{ kinds: [1, 20], ids }])
    .then((events) => hydrateEvents({ ...c.var, events }));

  // Sort events in the order they appear in the label.
  const events = ids
    .map((id) => results.find((event) => event.id === id))
    .filter((event): event is NostrEvent => !!event);

  const statuses = await Promise.all(
    events.map((event) => renderStatus(relay, event, {})),
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

export async function getTrendingTags(store: NStore, tagName: string, pubkey: string): Promise<TrendingTag[]> {
  const [label] = await store.query([{
    kinds: [1985],
    '#L': ['pub.ditto.trends'],
    '#l': [`#${tagName}`],
    authors: [pubkey],
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
        authors: [pubkey],
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

import { NostrFilter } from '@nostrify/nostrify';
import { z } from 'zod';

import { type AppContext, type AppController } from '@/app.ts';
import { Conf } from '@/config.ts';
import { getFeedPubkeys } from '@/queries.ts';
import { booleanParamSchema, languageSchema } from '@/schema.ts';
import { hydrateEvents } from '@/storages/hydrate.ts';
import { paginated } from '@/utils/api.ts';
import { getTagSet } from '@/utils/tags.ts';
import { renderReblog, renderStatus } from '@/views/mastodon/statuses.ts';

const homeTimelineController: AppController = async (c) => {
  const params = c.get('pagination');
  const pubkey = await c.get('signer')?.getPublicKey()!;
  const authors = [...await getFeedPubkeys(pubkey)];
  return renderStatuses(c, [{ authors, kinds: [1, 6], ...params }]);
};

const publicQuerySchema = z.object({
  local: booleanParamSchema.default('false'),
  instance: z.string().optional(),
  language: languageSchema.optional(),
});

const publicTimelineController: AppController = (c) => {
  const params = c.get('pagination');
  const result = publicQuerySchema.safeParse(c.req.query());

  if (!result.success) {
    return c.json({ error: 'Bad request', schema: result.error }, 400);
  }

  const { local, instance, language } = result.data;

  const filter: NostrFilter = { kinds: [1], ...params };

  const search: `${string}:${string}`[] = [];

  if (local) {
    search.push(`domain:${Conf.url.host}`);
  } else if (instance) {
    search.push(`domain:${instance}`);
  }

  if (language) {
    search.push(`language:${language}`);
  }

  filter.search = search.join(' ');

  return renderStatuses(c, [filter]);
};

const hashtagTimelineController: AppController = (c) => {
  const hashtag = c.req.param('hashtag')!.toLowerCase();
  const params = c.get('pagination');
  return renderStatuses(c, [{ kinds: [1], '#t': [hashtag], ...params }]);
};

const suggestedTimelineController: AppController = async (c) => {
  const store = c.get('store');
  const params = c.get('pagination');

  const [follows] = await store.query(
    [{ kinds: [3], authors: [Conf.pubkey], limit: 1 }],
  );

  const authors = [...getTagSet(follows?.tags ?? [], 'p')];

  return renderStatuses(c, [{ authors, kinds: [1], ...params }]);
};

/** Render statuses for timelines. */
async function renderStatuses(c: AppContext, filters: NostrFilter[]) {
  const { signal } = c.req.raw;
  const store = c.get('store');
  const opts = { signal, timeout: Conf.db.timeouts.timelines };

  const events = await store
    .query(filters, opts)
    .then((events) => hydrateEvents({ events, store, signal }));

  if (!events.length) {
    return c.json([]);
  }

  const viewerPubkey = await c.get('signer')?.getPublicKey();

  const statuses = (await Promise.all(events.map((event) => {
    if (event.kind === 6) {
      return renderReblog(event, { viewerPubkey });
    }
    return renderStatus(event, { viewerPubkey });
  }))).filter(Boolean);

  if (!statuses.length) {
    return c.json([]);
  }

  return paginated(c, events, statuses);
}

export { hashtagTimelineController, homeTimelineController, publicTimelineController, suggestedTimelineController };

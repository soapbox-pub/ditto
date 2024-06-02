import { NostrFilter } from '@nostrify/nostrify';
import { z } from 'zod';

import { type AppContext, type AppController } from '@/app.ts';
import { Conf } from '@/config.ts';
import { getFeedPubkeys } from '@/queries.ts';
import { booleanParamSchema } from '@/schema.ts';
import { hydrateEvents } from '@/storages/hydrate.ts';
import { paginated, paginationSchema } from '@/utils/api.ts';
import { getTagSet } from '@/utils/tags.ts';
import { renderReblog, renderStatus } from '@/views/mastodon/statuses.ts';

const homeTimelineController: AppController = async (c) => {
  const params = paginationSchema.parse(c.req.query());
  const pubkey = await c.get('signer')?.getPublicKey()!;
  const authors = await getFeedPubkeys(pubkey);
  return renderStatuses(c, [{ authors, kinds: [1, 6], ...params }]);
};

const publicQuerySchema = z.object({
  local: booleanParamSchema.catch(false),
  instance: z.string().optional().catch(undefined),
});

const publicTimelineController: AppController = (c) => {
  const params = paginationSchema.parse(c.req.query());
  const { local, instance } = publicQuerySchema.parse(c.req.query());

  const filter: NostrFilter = { kinds: [1], ...params };

  if (local) {
    filter.search = `domain:${Conf.url.host}`;
  } else if (instance) {
    filter.search = `domain:${instance}`;
  }

  return renderStatuses(c, [filter]);
};

const hashtagTimelineController: AppController = (c) => {
  const hashtag = c.req.param('hashtag')!.toLowerCase();
  const params = paginationSchema.parse(c.req.query());
  return renderStatuses(c, [{ kinds: [1], '#t': [hashtag], ...params }]);
};

const suggestedTimelineController: AppController = async (c) => {
  const store = c.get('store');
  const params = paginationSchema.parse(c.req.query());

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

  const events = await store
    .query(filters, { signal })
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

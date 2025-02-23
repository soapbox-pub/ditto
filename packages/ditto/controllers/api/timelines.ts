import { paginated } from '@ditto/mastoapi/pagination';
import { NostrFilter } from '@nostrify/nostrify';
import { z } from 'zod';

import { type AppContext, type AppController } from '@/app.ts';
import { getFeedPubkeys } from '@/queries.ts';
import { booleanParamSchema, languageSchema } from '@/schema.ts';
import { hydrateEvents } from '@/storages/hydrate.ts';
import { getTagSet } from '@/utils/tags.ts';
import { renderReblog, renderStatus } from '@/views/mastodon/statuses.ts';

const homeQuerySchema = z.object({
  exclude_replies: booleanParamSchema.optional(),
  only_media: booleanParamSchema.optional(),
});

const homeTimelineController: AppController = async (c) => {
  const { relay, user, pagination } = c.var;
  const pubkey = await user?.signer.getPublicKey()!;
  const result = homeQuerySchema.safeParse(c.req.query());

  if (!result.success) {
    return c.json({ error: 'Bad request', schema: result.error }, 400);
  }

  const { exclude_replies, only_media } = result.data;

  const authors = [...await getFeedPubkeys(relay, pubkey)];
  const filter: NostrFilter = { authors, kinds: [1, 6, 20], ...pagination };

  const search: string[] = [];

  if (only_media) {
    search.push('media:true');
  }

  if (exclude_replies) {
    search.push('reply:false');
  }

  if (search.length) {
    filter.search = search.join(' ');
  }

  return renderStatuses(c, [filter]);
};

const publicQuerySchema = z.object({
  local: booleanParamSchema.default('false'),
  instance: z.string().optional(),
  language: languageSchema.optional(),
});

const publicTimelineController: AppController = (c) => {
  const { conf } = c.var;
  const params = c.get('pagination');
  const result = publicQuerySchema.safeParse(c.req.query());

  if (!result.success) {
    return c.json({ error: 'Bad request', schema: result.error }, 400);
  }

  const { local, instance, language } = result.data;

  const filter: NostrFilter = { kinds: [1, 20], ...params };

  const search: `${string}:${string}`[] = [];

  if (local) {
    search.push(`domain:${conf.url.host}`);
  } else if (instance) {
    search.push(`domain:${instance}`);
  }

  if (language) {
    search.push(`language:${language}`);
  }

  if (search.length) {
    filter.search = search.join(' ');
  }

  return renderStatuses(c, [filter]);
};

const hashtagTimelineController: AppController = (c) => {
  const hashtag = c.req.param('hashtag')!.toLowerCase();
  const params = c.get('pagination');
  return renderStatuses(c, [{ kinds: [1, 20], '#t': [hashtag], ...params }]);
};

const suggestedTimelineController: AppController = async (c) => {
  const { conf, relay, pagination } = c.var;

  const [follows] = await relay.query(
    [{ kinds: [3], authors: [await conf.signer.getPublicKey()], limit: 1 }],
  );

  const authors = [...getTagSet(follows?.tags ?? [], 'p')];

  return renderStatuses(c, [{ authors, kinds: [1, 20], ...pagination }]);
};

/** Render statuses for timelines. */
async function renderStatuses(c: AppContext, filters: NostrFilter[]) {
  const { conf, user, signal } = c.var;

  const relay = user?.relay ?? c.var.relay;
  const opts = { signal, timeout: conf.db.timeouts.timelines };

  const events = await relay
    .query(filters, opts)
    .then((events) => hydrateEvents({ ...c.var, events }));

  if (!events.length) {
    return c.json([]);
  }

  const viewerPubkey = await user?.signer.getPublicKey();

  const statuses = (await Promise.all(events.map((event) => {
    if (event.kind === 6) {
      return renderReblog(relay, event, { viewerPubkey });
    }
    return renderStatus(relay, event, { viewerPubkey });
  }))).filter(Boolean);

  if (!statuses.length) {
    return c.json([]);
  }

  return paginated(c, events, statuses);
}

export { hashtagTimelineController, homeTimelineController, publicTimelineController, suggestedTimelineController };

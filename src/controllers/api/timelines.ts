import { NostrFilter } from '@soapbox/nspec';
import { type AppContext, type AppController } from '@/app.ts';
import { Conf } from '@/config.ts';
import { z } from '@/deps.ts';
import { getFeedPubkeys } from '@/queries.ts';
import { booleanParamSchema } from '@/schema.ts';
import { eventsDB } from '@/storages.ts';
import { hydrateEvents } from '@/storages/hydrate.ts';
import { paginated, paginationSchema } from '@/utils/api.ts';
import { renderReblog, renderStatus } from '@/views/mastodon/statuses.ts';

const homeTimelineController: AppController = async (c) => {
  const params = paginationSchema.parse(c.req.query());
  const pubkey = c.get('pubkey')!;
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

  const filter: NostrFilter = { kinds: [1, 6], ...params };

  if (local) {
    filter.search = `domain:${Conf.url.host}`;
  } else if (instance) {
    filter.search = `domain:${instance}`;
  }

  return renderStatuses(c, [filter]);
};

const hashtagTimelineController: AppController = (c) => {
  const hashtag = c.req.param('hashtag')!;
  const params = paginationSchema.parse(c.req.query());
  return renderStatuses(c, [{ kinds: [1], '#t': [hashtag], ...params }]);
};

/** Render statuses for timelines. */
async function renderStatuses(c: AppContext, filters: NostrFilter[]) {
  const { signal } = c.req.raw;

  const events = await eventsDB
    .query(filters, { signal })
    .then((events) =>
      hydrateEvents({ events, relations: ['author', 'author_stats', 'event_stats'], storage: eventsDB, signal })
    );

  if (!events.length) {
    return c.json([]);
  }

  const statuses = await Promise.all(events.map((event) => {
    if (event.kind === 6) {
      return renderReblog(event)
    }
    return renderStatus(event, c.get('pubkey'));
  }));
  return paginated(c, events, statuses);
}

export { hashtagTimelineController, homeTimelineController, publicTimelineController };

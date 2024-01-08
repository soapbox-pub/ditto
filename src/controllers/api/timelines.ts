import { eventsDB } from '@/storages.ts';
import { z } from '@/deps.ts';
import { type DittoFilter } from '@/filter.ts';
import { getFeedPubkeys } from '@/queries.ts';
import { booleanParamSchema } from '@/schema.ts';
import { paginated, paginationSchema } from '@/utils/api.ts';
import { renderStatus } from '@/views/mastodon/statuses.ts';

import type { AppContext, AppController } from '@/app.ts';

const homeTimelineController: AppController = async (c) => {
  const params = paginationSchema.parse(c.req.query());
  const pubkey = c.get('pubkey')!;
  const authors = await getFeedPubkeys(pubkey);
  return renderStatuses(c, [{ authors, kinds: [1], ...params }]);
};

const publicQuerySchema = z.object({
  local: booleanParamSchema.catch(false),
});

const publicTimelineController: AppController = (c) => {
  const params = paginationSchema.parse(c.req.query());
  const { local } = publicQuerySchema.parse(c.req.query());
  return renderStatuses(c, [{ kinds: [1], local, ...params }]);
};

const hashtagTimelineController: AppController = (c) => {
  const hashtag = c.req.param('hashtag')!;
  const params = paginationSchema.parse(c.req.query());
  return renderStatuses(c, [{ kinds: [1], '#t': [hashtag], ...params }]);
};

/** Render statuses for timelines. */
async function renderStatuses(c: AppContext, filters: DittoFilter<1>[], signal = AbortSignal.timeout(1000)) {
  const events = await eventsDB.filter(
    filters.map((filter) => ({ ...filter, relations: ['author', 'event_stats', 'author_stats'] })),
    { signal },
  );

  if (!events.length) {
    return c.json([]);
  }

  const statuses = await Promise.all(events.map((event) => renderStatus(event, c.get('pubkey'))));
  return paginated(c, events, statuses);
}

export { hashtagTimelineController, homeTimelineController, publicTimelineController };

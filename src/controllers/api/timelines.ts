import { z } from '@/deps.ts';
import { type DittoFilter } from '@/filter.ts';
import * as mixer from '@/mixer.ts';
import { getFeedPubkeys } from '@/queries.ts';
import { booleanParamSchema } from '@/schema.ts';
import { Time } from '@/utils.ts';
import { paginated, paginationSchema } from '@/utils/web.ts';
import { toStatus } from '@/views/nostr-to-mastoapi.ts';

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
async function renderStatuses(c: AppContext, filters: DittoFilter<1>[]) {
  const events = await mixer.getFilters(filters, { timeout: Time.seconds(1) });

  if (!events.length) {
    return c.json([]);
  }

  const statuses = await Promise.all(events.map((event) => toStatus(event, c.get('pubkey'))));
  return paginated(c, events, statuses);
}

export { hashtagTimelineController, homeTimelineController, publicTimelineController };

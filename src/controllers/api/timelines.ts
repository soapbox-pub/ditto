import { z } from '@/deps.ts';
import * as mixer from '@/mixer.ts';
import { getFeed, getPublicFeed } from '@/queries.ts';
import { booleanParamSchema } from '@/schema.ts';
import { toStatus } from '@/transformers/nostr-to-mastoapi.ts';
import { paginated, paginationSchema } from '@/utils/web.ts';
import { Time } from '@/utils.ts';

import type { AppController } from '@/app.ts';

const homeTimelineController: AppController = async (c) => {
  const params = paginationSchema.parse(c.req.query());
  const pubkey = c.get('pubkey')!;

  const events = await getFeed(pubkey, params);
  if (!events.length) {
    return c.json([]);
  }

  const statuses = await Promise.all(events.map(toStatus));
  return paginated(c, events, statuses);
};

const publicQuerySchema = z.object({
  local: booleanParamSchema.catch(false),
});

const publicTimelineController: AppController = async (c) => {
  const params = paginationSchema.parse(c.req.query());
  const { local } = publicQuerySchema.parse(c.req.query());

  const events = await getPublicFeed(params, local);
  if (!events.length) {
    return c.json([]);
  }

  const statuses = await Promise.all(events.map(toStatus));
  return paginated(c, events, statuses);
};

const hashtagTimelineController: AppController = async (c) => {
  const hashtag = c.req.param('hashtag')!;
  const params = paginationSchema.parse(c.req.query());

  const events = await mixer.getFilters(
    [{ kinds: [1], '#t': [hashtag], ...params }],
    { timeout: Time.seconds(3) },
  );

  if (!events.length) {
    return c.json([]);
  }

  const statuses = await Promise.all(events.map(toStatus));
  return paginated(c, events, statuses);
};

export { hashtagTimelineController, homeTimelineController, publicTimelineController };

import { z } from '@/deps.ts';
import { getFeed, getPublicFeed } from '@/queries.ts';
import { booleanParamSchema } from '@/schema.ts';
import { toStatus } from '@/transformers/nostr-to-mastoapi.ts';
import { buildLinkHeader, paginationSchema } from '@/utils/web.ts';

import type { AppController } from '@/app.ts';

const homeController: AppController = async (c) => {
  const params = paginationSchema.parse(c.req.query());
  const pubkey = c.get('pubkey')!;

  const events = await getFeed(pubkey, params);
  if (!events.length) {
    return c.json([]);
  }

  const statuses = (await Promise.all(events.map(toStatus))).filter(Boolean);

  const link = buildLinkHeader(c.req.url, events);
  return c.json(statuses, 200, link ? { link } : undefined);
};

const publicQuerySchema = z.object({
  local: booleanParamSchema.catch(false),
});

const publicController: AppController = async (c) => {
  const params = paginationSchema.parse(c.req.query());
  const { local } = publicQuerySchema.parse(c.req.query());

  const events = await getPublicFeed(params, local);
  if (!events.length) {
    return c.json([]);
  }

  const statuses = (await Promise.all(events.map(toStatus))).filter(Boolean);

  const link = buildLinkHeader(c.req.url, events);
  return c.json(statuses, 200, link ? { link } : undefined);
};

export { homeController, publicController };

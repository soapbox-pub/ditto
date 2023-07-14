import { getFeed, getFollows, getPublicFeed } from '@/client.ts';
import { toStatus } from '@/transformers/nostr-to-mastoapi.ts';
import { buildLinkHeader, paginationSchema } from '@/utils.ts';

import type { AppController } from '@/app.ts';

const homeController: AppController = async (c) => {
  const params = paginationSchema.parse(c.req.query());
  const pubkey = c.get('pubkey')!;

  const follows = await getFollows(pubkey);
  if (!follows) {
    return c.json([]);
  }

  const events = await getFeed(follows, params);
  if (!events.length) {
    return c.json([]);
  }

  const statuses = (await Promise.all(events.map(toStatus))).filter(Boolean);

  const link = buildLinkHeader(c.req.url, events);
  return c.json(statuses, 200, link ? { link } : undefined);
};

const publicController: AppController = async (c) => {
  const params = paginationSchema.parse(c.req.query());

  const events = await getPublicFeed(params);
  if (!events.length) {
    return c.json([]);
  }

  const statuses = (await Promise.all(events.map(toStatus))).filter(Boolean);

  const link = buildLinkHeader(c.req.url, events);
  return c.json(statuses, 200, link ? { link } : undefined);
};

export { homeController, publicController };

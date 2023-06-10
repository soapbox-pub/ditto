import { getFeed, getFollows } from '@/client.ts';
import { toStatus } from '@/transmute.ts';
import { buildLinkHeader, paginationSchema } from '@/utils.ts';

import type { AppController } from '@/app.ts';

const homeController: AppController = async (c) => {
  const { since, until } = paginationSchema.parse(c.req.query());
  const pubkey = c.get('pubkey')!;

  const follows = await getFollows(pubkey);
  if (!follows) {
    return c.json([]);
  }

  const events = await getFeed(follows, { since, until });
  if (!events.length) {
    return c.json([]);
  }

  const statuses = (await Promise.all(events.map(toStatus))).filter(Boolean);

  const link = buildLinkHeader(c.req.url, events);
  return c.json(statuses, 200, link ? { link } : undefined);
};

export { homeController };

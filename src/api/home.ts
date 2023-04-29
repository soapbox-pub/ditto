import { type AppController } from '@/app.ts';
import { z } from '@/deps.ts';

import { getFeed, getFollows } from '../client.ts';
import { toStatus } from '../transmute.ts';

import { LOCAL_DOMAIN } from '../config.ts';

const homeController: AppController = async (c) => {
  const since = paramSchema.parse(c.req.query('since'));
  const until = paramSchema.parse(c.req.query('until'));

  const pubkey = c.get('pubkey')!;

  const follows = await getFollows(pubkey);
  if (!follows) {
    return c.json([]);
  }

  const events = await getFeed(follows, { since, until });
  const statuses = (await Promise.all(events.map(toStatus))).filter(Boolean);

  const next = `${LOCAL_DOMAIN}/api/v1/timelines/home?until=${events[events.length - 1].created_at}`;
  const prev = `${LOCAL_DOMAIN}/api/v1/timelines/home?since=${events[0].created_at}`;

  return c.json(statuses, 200, {
    link: `<${next}>; rel="next", <${prev}>; rel="prev"`,
  });
};

const paramSchema = z.coerce.number().optional().catch(undefined);

export default homeController;

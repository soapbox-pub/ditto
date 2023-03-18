import { z } from '@/deps.ts';

import { fetchFeed, fetchFollows } from '../client.ts';
import { toStatus } from '../transmute.ts';
import { getKeys } from '../utils.ts';

import type { Context } from '@/deps.ts';
import { LOCAL_DOMAIN } from '../config.ts';

async function homeController(c: Context) {
  const since = paramSchema.parse(c.req.query('since'));
  const until = paramSchema.parse(c.req.query('until'));

  const keys = getKeys(c);
  if (!keys) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const follows = await fetchFollows(keys.pubkey);
  if (!follows) {
    return c.json([]);
  }

  const events = await fetchFeed(follows, { since, until });
  const statuses = (await Promise.all(events.map(toStatus))).filter(Boolean);

  const next = `${LOCAL_DOMAIN}/api/v1/timelines/home?until=${events[events.length - 1].created_at}`;
  const prev = `${LOCAL_DOMAIN}/api/v1/timelines/home?since=${events[0].created_at}`;

  return c.json(statuses, 200, {
    link: `<${next}>; rel="next", <${prev}>; rel="prev"`,
  });
}

const paramSchema = z.coerce.number().optional().catch(undefined);

export default homeController;

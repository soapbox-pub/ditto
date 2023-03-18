import { fetchFeed, fetchFollows } from '../client.ts';
import { getKeys } from '../utils.ts';

import type { Context } from '@/deps.ts';
import { toStatus } from '../transmute.ts';

async function homeController(c: Context) {
  const keys = getKeys(c);
  if (!keys) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const follows = await fetchFollows(keys.pubkey);
  if (!follows) {
    return c.json([]);
  }

  const events = await fetchFeed(follows);
  const statuses = (await Promise.all(events.map(toStatus))).filter(Boolean);

  return c.json(statuses);
}

export default homeController;

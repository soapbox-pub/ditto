import { fetchFeed, fetchFollows } from '../client.ts';
import { getKeys } from '../utils.ts';

import type { Context } from '@/deps.ts';
import type { SignedEvent } from '../event.ts';

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
  const statuses = events.map(toStatus);

  return c.json(statuses);
}

interface Account {
  id: string;
  acct: string;
  username: string;
}

interface Status {
  id: string;
  content: string;
  account: Account;
}

function toStatus(event: SignedEvent<1>): Status {
  return {
    id: event.id,
    content: event.content,
    account: {
      id: event.pubkey,
      acct: event.pubkey,
      username: event.pubkey,
    },
  };
}

export default homeController;

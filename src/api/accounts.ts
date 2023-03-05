import { fetchUser } from '../client.ts';
import { toAccount } from '../transmute.ts';
import { getKeys } from '../utils.ts';

import type { Context } from '@/deps.ts';

async function credentialsController(c: Context) {
  const keys = getKeys(c);

  if (keys) {
    const { pubkey } = keys;
    const event = await fetchUser(pubkey);
    if (event) {
      return c.json(toAccount(event));
    }
  }

  return c.json({ error: 'Invalid token' }, 400);
}

export { credentialsController };

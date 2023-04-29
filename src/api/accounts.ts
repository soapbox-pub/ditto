import { type AppController } from '@/app.ts';

import { getAuthor } from '../client.ts';
import { toAccount } from '../transmute.ts';

const credentialsController: AppController = async (c) => {
  const pubkey = c.get('pubkey')!;

  const event = await getAuthor(pubkey);
  if (event) {
    return c.json(toAccount(event));
  }

  return c.json({ error: 'Could not find user.' }, 404);
};

export { credentialsController };

import { Conf } from '@/config.ts';
import { findUser } from '@/db/users.ts';
import { z } from '@/deps.ts';

import type { AppController } from '@/app.ts';

const nameSchema = z.string().min(1).regex(/^\w+$/);

/**
 * Serves NIP-05's nostr.json.
 * https://github.com/nostr-protocol/nips/blob/master/05.md
 */
const nostrController: AppController = async (c) => {
  const name = nameSchema.safeParse(c.req.query('name'));
  const user = name.success ? await findUser({ username: name.data }) : null;

  if (!user) return c.json({ names: {}, relays: {} });

  return c.json({
    names: {
      [user.username]: user.pubkey,
    },
    relays: {
      [user.pubkey]: [Conf.relay],
    },
  });
};

export { nostrController };

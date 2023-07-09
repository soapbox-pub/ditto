import { Conf } from '@/config.ts';
import { db } from '@/db.ts';
import { z } from '@/deps.ts';

import type { AppController } from '@/app.ts';

const nameSchema = z.string().min(1).regex(/^\w+$/);

/**
 * Serves NIP-05's nostr.json.
 * https://github.com/nostr-protocol/nips/blob/master/05.md
 */
const nostrController: AppController = async (c) => {
  try {
    const name = nameSchema.parse(c.req.query('name'));
    const user = await db.users.findFirst({ where: { username: name } });
    const relay = Conf.relay;

    return c.json({
      names: {
        [user.username]: user.pubkey,
      },
      relays: relay
        ? {
          [user.pubkey]: [relay],
        }
        : {},
    });
  } catch (_e) {
    return c.json({ names: {}, relays: {} });
  }
};

export { nostrController };

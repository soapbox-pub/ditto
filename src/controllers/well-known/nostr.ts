import { z } from 'zod';

import { AppController } from '@/app.ts';
import { localNip05Lookup } from '@/utils/nip05.ts';

const nameSchema = z.string().min(1).regex(/^\w+$/);

/**
 * Serves NIP-05's nostr.json.
 * https://github.com/nostr-protocol/nips/blob/master/05.md
 */
const nostrController: AppController = async (c) => {
  const result = nameSchema.safeParse(c.req.query('name'));
  const name = result.success ? result.data : undefined;
  const pointer = name ? await localNip05Lookup(c.get('store'), name) : undefined;

  if (!name || !pointer) {
    return c.json({ names: {}, relays: {} });
  }

  const { pubkey, relays } = pointer;

  return c.json({
    names: {
      [name]: pubkey,
    },
    relays: {
      [pubkey]: relays,
    },
  });
};

export { nostrController };

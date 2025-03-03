import { NostrJson } from '@nostrify/nostrify';
import { z } from 'zod';

import { AppController } from '@/app.ts';
import { localNip05Lookup } from '@/utils/nip05.ts';

const nameSchema = z.string().min(1).regex(/^[\w.-]+$/);

/**
 * Serves NIP-05's nostr.json.
 * https://github.com/nostr-protocol/nips/blob/master/05.md
 */
const nostrController: AppController = async (c) => {
  const result = nameSchema.safeParse(c.req.query('name'));

  if (!result.success) {
    return c.json({ error: 'Invalid name parameter' }, { status: 422 });
  }

  const name = result.data;
  const pointer = name ? await localNip05Lookup(name, c.var) : undefined;

  if (!pointer) {
    return c.json({ names: {}, relays: {} } satisfies NostrJson, { status: 404 });
  }

  const { pubkey, relays = [] } = pointer;

  // It's found, so cache for 6 hours.
  c.header('Cache-Control', 'max-age=21600, public, stale-while-revalidate=3600');

  return c.json(
    {
      names: {
        [name]: pubkey,
      },
      relays: {
        [pubkey]: relays,
      },
    } satisfies NostrJson,
  );
};

export { nostrController };

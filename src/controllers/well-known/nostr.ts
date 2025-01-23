import { NostrJson } from '@nostrify/nostrify';
import { z } from 'zod';

import { AppController } from '@/app.ts';
import { localNip05Lookup } from '@/utils/nip05.ts';

const nameSchema = z.string().min(1).regex(/^[\w.-]+$/);
const emptyResult: NostrJson = { names: {}, relays: {} };

/**
 * Serves NIP-05's nostr.json.
 * https://github.com/nostr-protocol/nips/blob/master/05.md
 */
const nostrController: AppController = async (c) => {
  // If there are no query parameters, this will always return an empty result.
  if (!Object.entries(c.req.queries()).length) {
    c.header('Cache-Control', 'max-age=31536000, public, immutable');
    return c.json(emptyResult);
  }

  const store = c.get('store');

  const result = nameSchema.safeParse(c.req.query('name'));
  const name = result.success ? result.data : undefined;
  const pointer = name ? await localNip05Lookup(store, name) : undefined;

  if (!name || !pointer) {
    // Not found, cache for 5 minutes.
    c.header('Cache-Control', 'max-age=300, public');
    return c.json(emptyResult);
  }

  const { pubkey, relays = [] } = pointer;

  // It's found, so cache for 12 hours.
  c.header('Cache-Control', 'max-age=43200, public');

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

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
  const { relay } = c.var;

  // If there are no query parameters, this will always return an empty result.
  if (!Object.entries(c.req.queries()).length) {
    c.header('Cache-Control', 'max-age=31536000, public, immutable, stale-while-revalidate=86400');
    return c.json(emptyResult);
  }

  const result = nameSchema.safeParse(c.req.query('name'));
  const name = result.success ? result.data : undefined;
  const pointer = name ? await localNip05Lookup(relay, name) : undefined;

  if (!name || !pointer) {
    // Not found, cache for 5 minutes.
    c.header('Cache-Control', 'max-age=300, public, stale-while-revalidate=30');
    return c.json(emptyResult);
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

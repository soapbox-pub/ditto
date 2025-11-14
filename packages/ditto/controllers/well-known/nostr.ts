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
  const { conf, relay, signal } = c.var;
  const nameParam = c.req.query('name');

  // If no name parameter is provided, return all users
  if (!nameParam) {
    const adminPubkey = await conf.signer.getPublicKey();

    // Query all NIP-05 grants (kind 30360 events)
    const grants = await relay.query(
      [{ kinds: [30360], authors: [adminPubkey] }],
      { signal },
    );

    const names: Record<string, string> = {};
    const relays: Record<string, string[]> = {};

    for (const grant of grants) {
      // Extract the NIP-05 name from the 'd' tag
      const nip05 = grant.tags.find(([name]) => name === 'd')?.[1];
      // Extract the pubkey from the 'p' tag
      const pubkey = grant.tags.find(([name]) => name === 'p')?.[1];

      if (nip05 && pubkey) {
        // Extract just the localpart (before @)
        const localpart = nip05.split('@')[0];
        if (localpart) {
          names[localpart] = pubkey;
          relays[pubkey] = [conf.relay];
        }
      }
    }

    // Cache for 6 hours.
    c.header('Cache-Control', 'max-age=21600, public, stale-while-revalidate=3600');

    return c.json({ names, relays } satisfies NostrJson);
  }

  // Original behavior: lookup a specific name
  const result = nameSchema.safeParse(nameParam);

  if (!result.success) {
    return c.json({ error: 'Invalid name parameter' }, { status: 422 });
  }

  const name = result.data;
  const pointer = await localNip05Lookup(name, c.var);

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

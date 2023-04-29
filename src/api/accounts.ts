import { type AppController } from '@/app.ts';
import { nip05 } from '@/deps.ts';

import { getAuthor } from '../client.ts';
import { toAccount } from '../transmute.ts';
import { bech32ToPubkey } from '../utils.ts';

import type { Event } from '../event.ts';

const credentialsController: AppController = async (c) => {
  const pubkey = c.get('pubkey')!;

  const event = await getAuthor(pubkey);
  if (event) {
    return c.json(toAccount(event));
  }

  return c.json({ error: 'Could not find user.' }, 404);
};

const accountController: AppController = async (c) => {
  const pubkey = c.req.param('pubkey');

  const event = await getAuthor(pubkey);
  if (event) {
    return c.json(toAccount(event));
  }

  return c.json({ error: 'Could not find user.' }, 404);
};

const accountLookupController: AppController = async (c) => {
  const acct = c.req.query('acct');

  if (!acct) {
    return c.json({ error: 'Missing `acct` query parameter.' }, 422);
  }

  const event = await lookupAccount(acct);
  if (event) {
    return c.json(toAccount(event));
  }

  return c.json({ error: 'Could not find user.' }, 404);
};

const accountSearchController: AppController = async (c) => {
  const q = c.req.query('q');

  if (!q) {
    return c.json({ error: 'Missing `q` query parameter.' }, 422);
  }

  const event = await lookupAccount(decodeURIComponent(q));
  if (event) {
    return c.json([toAccount(event)]);
  }

  return c.json([]);
};

/** Resolve a bech32 or NIP-05 identifier to an account. */
async function lookupAccount(value: string): Promise<Event<0> | undefined> {
  console.log(`Looking up ${value}`);

  const pubkey = bech32ToPubkey(value) || (await nip05.queryProfile(value))?.pubkey;

  if (pubkey) {
    return getAuthor(pubkey);
  }
}

export { accountController, accountLookupController, accountSearchController, credentialsController };

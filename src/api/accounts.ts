import { type AppController } from '@/app.ts';

import { getAuthor } from '../client.ts';
import { toAccount } from '../transmute.ts';
import { bech32ToPubkey } from '../utils.ts';

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

  if (acct.includes('@')) {
    // TODO: NIP-05 handling
    return c.json({ error: 'NIP-05 lookups not yet implemented.' }, 422);
  }

  const pubkey = bech32ToPubkey(acct);
  if (pubkey) {
    const event = await getAuthor(pubkey);
    if (event) {
      return c.json(toAccount(event));
    }
  }

  return c.json({ error: 'Could not find user.' }, 404);
};

const accountSearchController: AppController = async (c) => {
  const q = c.req.query('q');

  if (!q) {
    return c.json({ error: 'Missing `q` query parameter.' }, 422);
  }

  const pubkey = bech32ToPubkey(q);
  if (pubkey) {
    const event = await getAuthor(pubkey);
    if (event) {
      return c.json([toAccount(event)]);
    }
  }

  return c.json([]);
};

export { accountController, accountLookupController, accountSearchController, credentialsController };

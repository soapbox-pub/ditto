import { AppController } from '@/app.ts';
import { lookupAccount } from '@/utils.ts';
import { toAccount } from '@/transformers/nostr-to-mastoapi.ts';

const searchController: AppController = async (c) => {
  const q = c.req.query('q');

  if (!q) {
    return c.json({ error: 'Missing `q` query parameter.' }, 422);
  }

  // For now, only support looking up accounts.
  // TODO: Support searching statuses and hashtags.
  const event = await lookupAccount(decodeURIComponent(q));

  return c.json({
    accounts: event ? [await toAccount(event)] : [],
    statuses: [],
    hashtags: [],
  });
};

export { searchController };

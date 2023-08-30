import { AppController } from '@/app.ts';
import * as eventsDB from '@/db/events.ts';
import { lookupAccount } from '@/utils.ts';
import { toAccount, toStatus } from '@/transformers/nostr-to-mastoapi.ts';

const searchController: AppController = async (c) => {
  const q = c.req.query('q');

  if (!q) {
    return c.json({ error: 'Missing `q` query parameter.' }, 422);
  }

  // For now, only support looking up accounts.
  // TODO: Support searching statuses and hashtags.
  const event = await lookupAccount(decodeURIComponent(q));

  const events = await eventsDB.getFilters([{ kinds: [1], search: q }]);
  const statuses = await Promise.all(events.map((event) => toStatus(event, c.get('pubkey'))));

  return c.json({
    accounts: event ? [await toAccount(event)] : [],
    statuses: statuses.filter(Boolean),
    hashtags: [],
  });
};

export { searchController };

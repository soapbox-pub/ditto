import { type AppController } from '@/app.ts';
import { Conf } from '@/config.ts';
import { eventsDB } from '@/storages.ts';
import { renderAdminAccount } from '@/views/mastodon/admin-accounts.ts';

const adminAccountsController: AppController = async (c) => {
  const events = await eventsDB.getEvents([{ kinds: [30361], authors: [Conf.pubkey], limit: 20 }]);
  const pubkeys = events.map((event) => event.tags.find(([name]) => name === 'd')?.[1]!);
  const authors = await eventsDB.getEvents([{ kinds: [0], ids: pubkeys, limit: pubkeys.length }]);

  for (const event of events) {
    const d = event.tags.find(([name]) => name === 'd')?.[1];
    event.d_author = authors.find((author) => author.pubkey === d);
  }

  return c.json(
    await Promise.all(
      events.map((event) => renderAdminAccount(event)),
    ),
  );
};

export { adminAccountsController };

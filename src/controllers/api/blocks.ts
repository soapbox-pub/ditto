import { type AppController } from '@/app.ts';
import { eventsDB } from '@/storages.ts';
import { getTagSet } from '@/tags.ts';
import { renderAccounts } from '@/views.ts';

/** https://docs.joinmastodon.org/methods/blocks/#get */
const blocksController: AppController = async (c) => {
  const pubkey = c.get('pubkey')!;

  const [event10000] = await eventsDB.getEvents([
    { kinds: [10000], authors: [pubkey], limit: 1 },
  ]);

  if (event10000) {
    const pubkeys = getTagSet(event10000.tags, 'p');
    return renderAccounts(c, [...pubkeys].reverse());
  } else {
    return c.json([]);
  }
};

export { blocksController };

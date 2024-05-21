import { type AppController } from '@/app.ts';
import { Storages } from '@/storages.ts';
import { getTagSet } from '@/utils/tags.ts';
import { renderAccounts } from '@/views.ts';

/** https://docs.joinmastodon.org/methods/mutes/#get */
const mutesController: AppController = async (c) => {
  const store = await Storages.db();
  const pubkey = await c.get('signer')?.getPublicKey()!;
  const { signal } = c.req.raw;

  const [event10000] = await store.query(
    [{ kinds: [10000], authors: [pubkey], limit: 1 }],
    { signal },
  );

  if (event10000) {
    const pubkeys = getTagSet(event10000.tags, 'p');
    return renderAccounts(c, [...pubkeys].reverse());
  } else {
    return c.json([]);
  }
};

export { mutesController };

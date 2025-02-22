import { type AppController } from '@/app.ts';
import { getTagSet } from '@/utils/tags.ts';
import { renderAccounts } from '@/views.ts';

/** https://docs.joinmastodon.org/methods/mutes/#get */
const mutesController: AppController = async (c) => {
  const { relay, user, signal } = c.var;

  const pubkey = await user!.signer.getPublicKey();

  const [event10000] = await relay.query(
    [{ kinds: [10000], authors: [pubkey], limit: 1 }],
    { signal },
  );

  if (event10000) {
    const pubkeys = getTagSet(event10000.tags, 'p');
    return renderAccounts(c, [...pubkeys]);
  } else {
    return c.json([]);
  }
};

export { mutesController };

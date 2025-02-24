import { type AppController } from '@/app.ts';
import { getTagSet } from '@/utils/tags.ts';
import { renderStatuses } from '@/views.ts';

/** https://docs.joinmastodon.org/methods/bookmarks/#get */
const bookmarksController: AppController = async (c) => {
  const { relay, user, signal } = c.var;

  const pubkey = await user!.signer.getPublicKey();

  const [event10003] = await relay.query(
    [{ kinds: [10003], authors: [pubkey], limit: 1 }],
    { signal },
  );

  if (event10003) {
    const eventIds = getTagSet(event10003.tags, 'e');
    return renderStatuses(c, [...eventIds].reverse());
  } else {
    return c.json([]);
  }
};

export { bookmarksController };

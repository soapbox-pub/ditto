import { type AppController } from '@/app.ts';
import { Storages } from '@/storages.ts';
import { getTagSet } from '@/tags.ts';
import { renderStatuses } from '@/views.ts';

/** https://docs.joinmastodon.org/methods/bookmarks/#get */
const bookmarksController: AppController = async (c) => {
  const pubkey = c.get('pubkey')!;
  const { signal } = c.req.raw;

  const [event10003] = await Storages.db.query(
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

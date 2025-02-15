import { AppController } from '@/app.ts';

/** https://docs.joinmastodon.org/methods/blocks/#get */
export const blocksController: AppController = (c) => {
  return c.json({ error: 'Blocking is not supported by Nostr' }, 422);
};

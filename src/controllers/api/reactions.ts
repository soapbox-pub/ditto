import { AppController } from '@/app.ts';
import { Storages } from '@/storages.ts';
import { createEvent } from '@/utils/api.ts';
import { renderStatus } from '@/views/mastodon/statuses.ts';

/**
 * React to a status.
 * https://docs.pleroma.social/backend/development/API/pleroma_api/#put-apiv1pleromastatusesidreactionsemoji
 */
const reactionController: AppController = async (c) => {
  const id = c.req.param('id');
  const emoji = c.req.param('emoji');
  const signer = c.get('signer')!;

  if (!/^\p{RGI_Emoji}$/v.test(emoji)) {
    return c.json({ error: 'Invalid emoji' }, 400);
  }

  const store = await Storages.db();
  const [event] = await store.query([{ kinds: [1], ids: [id], limit: 1 }]);

  if (!event) {
    return c.json({ error: 'Status not found' }, 404);
  }

  await createEvent({
    kind: 7,
    content: '',
    created_at: Math.floor(Date.now() / 1000),
    tags: [['e', id]],
  }, c);

  const status = renderStatus(event, { viewerPubkey: await signer.getPublicKey() });

  return c.json(status);
};

export { reactionController };

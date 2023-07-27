import { getAuthor } from '@/client.ts';
import { db } from '@/db.ts';
import { toActor } from '@/transformers/nostr-to-activitypub.ts';
import { activityJson } from '@/utils.ts';

import type { AppController } from '@/app.ts';

const actorController: AppController = async (c) => {
  const notFound = c.json({ error: 'Not found' }, 404);

  const username = c.req.param('username');
  const user = await db.users.findFirst({ where: { username } });

  const event = await getAuthor(user.pubkey);
  if (!event) return notFound;

  const actor = await toActor(event);
  if (!actor) return notFound;

  return activityJson(c, actor);
};

export { actorController };

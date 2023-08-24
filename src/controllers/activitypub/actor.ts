import { findUser } from '@/db/users.ts';
import { getAuthor } from '@/queries.ts';
import { toActor } from '@/transformers/nostr-to-activitypub.ts';
import { activityJson } from '@/utils/web.ts';

import type { AppContext, AppController } from '@/app.ts';

const actorController: AppController = async (c) => {
  const username = c.req.param('username');

  const user = await findUser({ username });
  if (!user) return notFound(c);

  const event = await getAuthor(user.pubkey);
  if (!event) return notFound(c);

  const actor = await toActor(event, user.username);
  if (!actor) return notFound(c);

  return activityJson(c, actor);
};

function notFound(c: AppContext) {
  return c.json({ error: 'Not found' }, 404);
}

export { actorController };
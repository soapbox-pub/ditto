import { findUser } from '@/db/users.ts';
import { getAuthor } from '@/queries.ts';
import { activityJson } from '@/utils/api.ts';
import { renderActor } from '@/views/activitypub/actor.ts';

import type { AppContext, AppController } from '@/app.ts';

const actorController: AppController = async (c) => {
  const username = c.req.param('username');
  const { signal } = c.req.raw;

  const user = await findUser({ username }, signal);
  if (!user) return notFound(c);

  const event = await getAuthor(user.pubkey, { signal });
  if (!event) return notFound(c);

  const actor = await renderActor(event, user.username);
  if (!actor) return notFound(c);

  return activityJson(c, actor);
};

function notFound(c: AppContext) {
  return c.json({ error: 'Not found' }, 404);
}

export { actorController };

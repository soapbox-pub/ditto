import { getAuthor } from '@/queries.ts';
import { activityJson } from '@/utils/api.ts';
import { renderActor } from '@/views/activitypub/actor.ts';
import { localNip05Lookup } from '@/utils/nip05.ts';

import type { AppContext, AppController } from '@/app.ts';

const actorController: AppController = async (c) => {
  const username = c.req.param('username');
  const { signal } = c.req.raw;

  const pointer = await localNip05Lookup(c.get('store'), username);
  if (!pointer) return notFound(c);

  const event = await getAuthor(pointer.pubkey, { signal });
  if (!event) return notFound(c);

  const actor = await renderActor(event, username);
  if (!actor) return notFound(c);

  return activityJson(c, actor);
};

function notFound(c: AppContext) {
  return c.json({ error: 'Not found' }, 404);
}

export { actorController };

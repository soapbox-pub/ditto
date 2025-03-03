import { userMiddleware } from '@ditto/mastoapi/middleware';
import { DittoRoute } from '@ditto/mastoapi/router';
import { z } from 'zod';

import { parseBody, updateUser } from '@/utils/api.ts';
import { lookupPubkey } from '@/utils/lookup.ts';

const route = new DittoRoute();

const pleromaPromoteAdminSchema = z.object({
  nicknames: z.string().array(),
});

route.post('/:group', userMiddleware({ role: 'admin' }), async (c) => {
  const body = await parseBody(c.req.raw);
  const result = pleromaPromoteAdminSchema.safeParse(body);
  const group = c.req.param('group');

  if (!result.success) {
    return c.json({ error: 'Bad request', schema: result.error }, 422);
  }

  if (!['admin', 'moderator'].includes(group)) {
    return c.json({ error: 'Bad request', schema: 'Invalid group' }, 422);
  }

  const { data } = result;
  const { nicknames } = data;

  for (const nickname of nicknames) {
    const pubkey = await lookupPubkey(nickname, c.var);
    if (pubkey) {
      await updateUser(pubkey, { [group]: true }, c);
    }
  }

  return c.json({ [`is_${group}`]: true }, 200);
});

export default route;

import { z } from 'zod';

import { type AppController } from '@/app.ts';
import { Conf } from '@/config.ts';
import { booleanParamSchema } from '@/schema.ts';
import { Storages } from '@/storages.ts';
import { renderAdminAccount } from '@/views/mastodon/admin-accounts.ts';
import { paginated, paginationSchema, parseBody, updateListAdminEvent } from '@/utils/api.ts';
import { addTag } from '@/tags.ts';

const adminAccountQuerySchema = z.object({
  local: booleanParamSchema.optional(),
  remote: booleanParamSchema.optional(),
  active: booleanParamSchema.optional(),
  pending: booleanParamSchema.optional(),
  disabled: booleanParamSchema.optional(),
  silenced: booleanParamSchema.optional(),
  suspended: booleanParamSchema.optional(),
  sensitized: booleanParamSchema.optional(),
  username: z.string().optional(),
  display_name: z.string().optional(),
  by_domain: z.string().optional(),
  email: z.string().optional(),
  ip: z.string().optional(),
  staff: booleanParamSchema.optional(),
});

const adminAccountsController: AppController = async (c) => {
  const {
    pending,
    disabled,
    silenced,
    suspended,
    sensitized,
  } = adminAccountQuerySchema.parse(c.req.query());

  // Not supported.
  if (pending || disabled || silenced || suspended || sensitized) {
    return c.json([]);
  }

  const { since, until, limit } = paginationSchema.parse(c.req.query());
  const { signal } = c.req.raw;

  const events = await Storages.db.query([{ kinds: [30361], authors: [Conf.pubkey], since, until, limit }], { signal });
  const pubkeys = events.map((event) => event.tags.find(([name]) => name === 'd')?.[1]!);
  const authors = await Storages.db.query([{ kinds: [0], authors: pubkeys }], { signal });

  for (const event of events) {
    const d = event.tags.find(([name]) => name === 'd')?.[1];
    event.d_author = authors.find((author) => author.pubkey === d);
  }

  const accounts = await Promise.all(
    events.map((event) => renderAdminAccount(event)),
  );

  return paginated(c, events, accounts);
};

const adminAccountActionSchema = z.object({
  type: z.enum(['none', 'sensitive', 'disable', 'silence', 'suspend']),
});

const adminAccountAction: AppController = async (c) => {
  const body = await parseBody(c.req.raw);
  const result = adminAccountActionSchema.safeParse(body);
  const authorId = c.req.param('id');
  const store = c.get('store');
  const { signal } = c.req.raw;

  if (!result.success) {
    return c.json({ error: 'This action is not allowed' }, 403);
  }

  const { data } = result;

  if (data.type !== 'disable') {
    return c.json({ error: 'Record invalid' }, 422);
  }

  const [event] = await store.query([{ kinds: [0], authors: [authorId], limit: 1 }], { signal });
  if (!event) {
    return c.json({ error: 'Record not found' }, 404);
  }

  await updateListAdminEvent(
    { kinds: [10000], authors: [Conf.pubkey] },
    (tags) => addTag(tags, ['p', event.pubkey]),
    c,
  );

  return c.json({}, 200);
};

export { adminAccountAction, adminAccountsController };

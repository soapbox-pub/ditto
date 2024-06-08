import { z } from 'zod';

import { type AppController } from '@/app.ts';
import { Conf } from '@/config.ts';
import { DittoEvent } from '@/interfaces/DittoEvent.ts';
import { booleanParamSchema } from '@/schema.ts';
import { Storages } from '@/storages.ts';
import { paginated, paginationSchema, parseBody, updateUser } from '@/utils/api.ts';
import { renderAdminAccount } from '@/views/mastodon/admin-accounts.ts';

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

  const store = await Storages.db();
  const { since, until, limit } = paginationSchema.parse(c.req.query());
  const { signal } = c.req.raw;

  const events = await store.query([{ kinds: [30382], authors: [Conf.pubkey], since, until, limit }], { signal });
  const pubkeys = events.map((event) => event.tags.find(([name]) => name === 'd')?.[1]!);
  const authors = await store.query([{ kinds: [0], authors: pubkeys }], { signal });

  for (const event of events) {
    const d = event.tags.find(([name]) => name === 'd')?.[1];
    (event as DittoEvent).d_author = authors.find((author) => author.pubkey === d);
  }

  const accounts = await Promise.all(
    events.map((event) => renderAdminAccount(event)),
  );

  return paginated(c, events, accounts);
};

const adminAccountActionSchema = z.object({
  type: z.enum(['none', 'sensitive', 'disable', 'silence', 'suspend']),
});

const adminActionController: AppController = async (c) => {
  const body = await parseBody(c.req.raw);
  const result = adminAccountActionSchema.safeParse(body);
  const authorId = c.req.param('id');

  if (!result.success) {
    return c.json({ error: 'This action is not allowed' }, 403);
  }

  const { data } = result;

  const n: Record<string, boolean> = {};

  if (data.type === 'sensitive') {
    n.sensitive = true;
  }
  if (data.type === 'disable') {
    n.disable = true;
  }
  if (data.type === 'silence') {
    n.silence = true;
  }
  if (data.type === 'suspend') {
    n.suspend = true;
  }

  await updateUser(authorId, n, c);

  return c.json({}, 200);
};

export { adminAccountsController, adminActionController };

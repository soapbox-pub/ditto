import { type AppController } from '@/app.ts';
import { Conf } from '@/config.ts';
import { z } from '@/deps.ts';
import { booleanParamSchema } from '@/schema.ts';
import { eventsDB } from '@/storages.ts';
import { renderAdminAccount } from '@/views/mastodon/admin-accounts.ts';
import { paginated, paginationSchema } from '@/utils/api.ts';

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

  const events = await eventsDB.filter([{ kinds: [30361], authors: [Conf.pubkey], since, until, limit }]);
  const pubkeys = events.map((event) => event.tags.find(([name]) => name === 'd')?.[1]!);
  const authors = await eventsDB.filter([{ kinds: [0], authors: pubkeys }]);

  for (const event of events) {
    const d = event.tags.find(([name]) => name === 'd')?.[1];
    event.d_author = authors.find((author) => author.pubkey === d);
  }

  const accounts = await Promise.all(
    events.map((event) => renderAdminAccount(event)),
  );

  return paginated(c, events, accounts);
};

export { adminAccountsController };

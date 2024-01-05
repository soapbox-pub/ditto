import { type AppController } from '@/app.ts';
import { Conf } from '@/config.ts';
import { z } from '@/deps.ts';
import { booleanParamSchema } from '@/schema.ts';
import { eventsDB } from '@/storages.ts';
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
  max_id: z.string().optional(),
  since_id: z.string().optional(),
  min_id: z.string().optional(),
  limit: z.number().min(1).max(80).optional(),
});

const adminAccountsController: AppController = async (c) => {
  const {
    pending,
    disabled,
    silenced,
    suspended,
    sensitized,
    limit,
  } = adminAccountQuerySchema.parse(c.req.query());

  // Not supported.
  if (pending || disabled || silenced || suspended || sensitized) {
    return c.json([]);
  }

  const events = await eventsDB.getEvents([{ kinds: [30361], authors: [Conf.pubkey], limit }]);
  const pubkeys = events.map((event) => event.tags.find(([name]) => name === 'd')?.[1]!);
  const authors = await eventsDB.getEvents([{ kinds: [0], ids: pubkeys, limit: pubkeys.length }]);

  for (const event of events) {
    const d = event.tags.find(([name]) => name === 'd')?.[1];
    event.d_author = authors.find((author) => author.pubkey === d);
  }

  return c.json(
    await Promise.all(
      events.map((event) => renderAdminAccount(event)),
    ),
  );
};

export { adminAccountsController };

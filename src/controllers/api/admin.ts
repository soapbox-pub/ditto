import { NostrEvent } from '@nostrify/nostrify';
import { z } from 'zod';

import { type AppController } from '@/app.ts';
import { Conf } from '@/config.ts';
import { booleanParamSchema } from '@/schema.ts';
import { Storages } from '@/storages.ts';
import { paginated, paginationSchema, parseBody, updateListAdminEvent } from '@/utils/api.ts';
import { addTag } from '@/utils/tags.ts';
import { renderAdminAccount, renderAdminAccountFromPubkey } from '@/views/mastodon/admin-accounts.ts';
import { hydrateEvents } from '@/storages/hydrate.ts';

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
  if (disabled || silenced || suspended || sensitized) {
    return c.json([]);
  }

  const store = await Storages.db();
  const params = paginationSchema.parse(c.req.query());
  const { signal } = c.req.raw;

  const pubkeys = new Set<string>();
  const events: NostrEvent[] = [];

  if (pending) {
    for (const event of await store.query([{ kinds: [3036], ...params }], { signal })) {
      pubkeys.add(event.pubkey);
      events.push(event);
    }
  } else {
    for (const event of await store.query([{ kinds: [30360], authors: [Conf.pubkey], ...params }], { signal })) {
      const pubkey = event.tags.find(([name]) => name === 'd')?.[1];
      if (pubkey) {
        pubkeys.add(pubkey);
        events.push(event);
      }
    }
  }

  const authors = await store.query([{ kinds: [0], authors: [...pubkeys] }], { signal })
    .then((events) => hydrateEvents({ store, events, signal }));

  const accounts = await Promise.all(
    [...pubkeys].map(async (pubkey) => {
      const author = authors.find((event) => event.pubkey === pubkey);
      const account = author ? await renderAdminAccount(author) : await renderAdminAccountFromPubkey(pubkey);
      const request = events.find((event) => event.kind === 3036 && event.pubkey === pubkey);
      const grant = events.find(
        (event) => event.kind === 30360 && event.tags.find(([name]) => name === 'd')?.[1] === pubkey,
      );

      return {
        ...account,
        invite_request: request?.content ?? null,
        invite_request_username: request?.tags.find(([name]) => name === 'r')?.[1] ?? null,
        approved: !!grant,
      };
    }),
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

  if (!result.success) {
    return c.json({ error: 'This action is not allowed' }, 403);
  }

  const { data } = result;

  if (data.type !== 'disable') {
    return c.json({ error: 'Record invalid' }, 422);
  }

  await updateListAdminEvent(
    { kinds: [10000], authors: [Conf.pubkey], limit: 1 },
    (tags) => addTag(tags, ['p', authorId]),
    c,
  );

  return c.json({}, 200);
};

export { adminAccountAction, adminAccountsController };

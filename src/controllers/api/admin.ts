import { NostrFilter } from '@nostrify/nostrify';
import { z } from 'zod';

import { type AppController } from '@/app.ts';
import { Conf } from '@/config.ts';
import { booleanParamSchema } from '@/schema.ts';
import { Storages } from '@/storages.ts';
import { hydrateEvents } from '@/storages/hydrate.ts';
import { paginated, paginationSchema, parseBody, updateUser } from '@/utils/api.ts';
import { renderNameRequest } from '@/views/ditto.ts';
import { renderAdminAccount, renderAdminAccountFromPubkey } from '@/views/mastodon/admin-accounts.ts';

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
  const store = await Storages.db();
  const params = paginationSchema.parse(c.req.query());
  const { signal } = c.req.raw;
  const {
    local,
    pending,
    disabled,
    silenced,
    suspended,
    sensitized,
    staff,
  } = adminAccountQuerySchema.parse(c.req.query());

  if (pending) {
    if (disabled || silenced || suspended || sensitized) {
      return c.json([]);
    }

    const orig = await store.query(
      [{ kinds: [30383], authors: [Conf.pubkey], '#k': ['3036'], ...params }],
      { signal },
    );

    const ids = new Set<string>(
      orig
        .map(({ tags }) => tags.find(([name]) => name === 'd')?.[1])
        .filter((id): id is string => !!id),
    );

    const events = await store.query([{ kinds: [3036], ids: [...ids] }])
      .then((events) => hydrateEvents({ store, events, signal }));

    const nameRequests = await Promise.all(events.map(renderNameRequest));
    return paginated(c, orig, nameRequests);
  }

  if (disabled || silenced || suspended || sensitized) {
    const n = [];

    if (disabled) {
      n.push('disabled');
    }
    if (silenced) {
      n.push('silenced');
    }
    if (suspended) {
      n.push('suspended');
    }
    if (sensitized) {
      n.push('sensitized');
    }
    if (staff) {
      n.push('admin');
      n.push('moderator');
    }

    const events = await store.query([{ kinds: [30382], authors: [Conf.pubkey], '#n': n, ...params }], { signal });
    const pubkeys = new Set<string>(events.map(({ pubkey }) => pubkey));
    const authors = await store.query([{ kinds: [0], authors: [...pubkeys] }])
      .then((events) => hydrateEvents({ store, events, signal }));

    const accounts = await Promise.all(
      [...pubkeys].map((pubkey) => {
        const author = authors.find((e) => e.pubkey === pubkey);
        return author ? renderAdminAccount(author) : renderAdminAccountFromPubkey(pubkey);
      }),
    );

    return paginated(c, events, accounts);
  }

  const filter: NostrFilter = { kinds: [0], ...params };
  if (local) {
    filter.search = `domain:${Conf.url.host}`;
  }
  const events = await store.query([filter], { signal });
  const accounts = await Promise.all(events.map(renderAdminAccount));
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
    n.sensitized = true;
  }
  if (data.type === 'disable') {
    n.disabled = true;
  }
  if (data.type === 'silence') {
    n.silenced = true;
  }
  if (data.type === 'suspend') {
    n.suspended = true;
  }

  await updateUser(authorId, n, c);

  return c.json({}, 200);
};

export { adminAccountsController, adminActionController };

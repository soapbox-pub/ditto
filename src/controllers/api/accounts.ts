import { type AppController } from '@/app.ts';
import { Conf } from '@/config.ts';
import { eventsDB } from '@/db/events.ts';
import { insertUser } from '@/db/users.ts';
import { findReplyTag, nip19, z } from '@/deps.ts';
import { type DittoFilter } from '@/filter.ts';
import { getAuthor, getFollowedPubkeys } from '@/queries.ts';
import { booleanParamSchema, fileSchema } from '@/schema.ts';
import { jsonMetaContentSchema } from '@/schemas/nostr.ts';
import { addTag } from '@/tags.ts';
import { uploadFile } from '@/upload.ts';
import { lookupAccount, nostrNow } from '@/utils.ts';
import { paginated, paginationSchema, parseBody, updateListEvent } from '@/utils/web.ts';
import { createEvent } from '@/utils/web.ts';
import { renderAccounts, renderEventAccounts } from '@/views.ts';
import { accountFromPubkey, renderAccount } from '@/views/mastodon/accounts.ts';
import { renderRelationship } from '@/views/mastodon/relationships.ts';
import { renderStatus } from '@/views/mastodon/statuses.ts';

const usernameSchema = z
  .string().min(1).max(30)
  .regex(/^[a-z0-9_]+$/i)
  .refine((username) => !Conf.forbiddenUsernames.includes(username), 'Username is reserved.');

const createAccountSchema = z.object({
  username: usernameSchema,
});

const createAccountController: AppController = async (c) => {
  if (!Conf.registrations) {
    return c.json({ error: 'Registrations are disabled.' }, 403);
  }

  const pubkey = c.get('pubkey')!;
  const result = createAccountSchema.safeParse(await c.req.json());

  if (!result.success) {
    return c.json({ error: 'Bad request', schema: result.error }, 400);
  }

  try {
    await insertUser({
      pubkey,
      username: result.data.username,
      inserted_at: new Date(),
      admin: false,
    });

    return c.json({
      access_token: nip19.npubEncode(pubkey),
      token_type: 'Bearer',
      scope: 'read write follow push',
      created_at: nostrNow(),
    });
  } catch (_e) {
    return c.json({ error: 'Username already taken.' }, 422);
  }
};

const verifyCredentialsController: AppController = async (c) => {
  const pubkey = c.get('pubkey')!;

  const event = await getAuthor(pubkey, { relations: ['author_stats'] });
  if (event) {
    return c.json(await renderAccount(event, { withSource: true }));
  } else {
    return c.json(await accountFromPubkey(pubkey, { withSource: true }));
  }
};

const accountController: AppController = async (c) => {
  const pubkey = c.req.param('pubkey');

  const event = await getAuthor(pubkey);
  if (event) {
    return c.json(await renderAccount(event));
  }

  return c.json({ error: 'Could not find user.' }, 404);
};

const accountLookupController: AppController = async (c) => {
  const acct = c.req.query('acct');

  if (!acct) {
    return c.json({ error: 'Missing `acct` query parameter.' }, 422);
  }

  const event = await lookupAccount(decodeURIComponent(acct));
  if (event) {
    return c.json(await renderAccount(event));
  }

  return c.json({ error: 'Could not find user.' }, 404);
};

const accountSearchController: AppController = async (c) => {
  const q = c.req.query('q');

  if (!q) {
    return c.json({ error: 'Missing `q` query parameter.' }, 422);
  }

  const event = await lookupAccount(decodeURIComponent(q));
  if (event) {
    return c.json([await renderAccount(event)]);
  }

  return c.json([]);
};

const relationshipsController: AppController = async (c) => {
  const pubkey = c.get('pubkey')!;
  const ids = z.array(z.string()).safeParse(c.req.queries('id[]'));

  if (!ids.success) {
    return c.json({ error: 'Missing `id[]` query parameters.' }, 422);
  }

  const result = await Promise.all(ids.data.map((id) => renderRelationship(pubkey, id)));

  return c.json(result);
};

const accountStatusesQuerySchema = z.object({
  pinned: booleanParamSchema.optional(),
  limit: z.coerce.number().nonnegative().transform((v) => Math.min(v, 40)).catch(20),
  exclude_replies: booleanParamSchema.optional(),
  tagged: z.string().optional(),
});

const accountStatusesController: AppController = async (c) => {
  const pubkey = c.req.param('pubkey');
  const { since, until } = paginationSchema.parse(c.req.query());
  const { pinned, limit, exclude_replies, tagged } = accountStatusesQuerySchema.parse(c.req.query());

  // Nostr doesn't support pinned statuses.
  if (pinned) {
    return c.json([]);
  }

  const filter: DittoFilter<1> = {
    authors: [pubkey],
    kinds: [1],
    relations: ['author', 'event_stats', 'author_stats'],
    since,
    until,
    limit,
  };

  if (tagged) {
    filter['#t'] = [tagged];
  }

  let events = await eventsDB.getEvents([filter]);

  if (exclude_replies) {
    events = events.filter((event) => !findReplyTag(event));
  }

  const statuses = await Promise.all(events.map((event) => renderStatus(event, c.get('pubkey'))));
  return paginated(c, events, statuses);
};

const updateCredentialsSchema = z.object({
  display_name: z.string().optional(),
  note: z.string().optional(),
  avatar: fileSchema.optional(),
  header: fileSchema.optional(),
  locked: z.boolean().optional(),
  bot: z.boolean().optional(),
  discoverable: z.boolean().optional(),
});

const updateCredentialsController: AppController = async (c) => {
  const pubkey = c.get('pubkey')!;
  const user = c.get('user')!;
  const body = await parseBody(c.req.raw);
  const result = updateCredentialsSchema.safeParse(body);

  if (!result.success) {
    return c.json(result.error, 422);
  }

  const author = await getAuthor(pubkey);
  const meta = author ? jsonMetaContentSchema.parse(author.content) : {};

  const {
    avatar: avatarFile,
    header: headerFile,
    display_name,
    note,
  } = result.data;

  const [avatar, header] = await Promise.all([
    avatarFile ? uploadFile(avatarFile, { pubkey }) : undefined,
    headerFile ? uploadFile(headerFile, { pubkey }) : undefined,
  ]);

  meta.name = display_name ?? meta.name;
  meta.about = note ?? meta.about;
  meta.picture = avatar?.url ?? meta.picture;
  meta.banner = header?.url ?? meta.banner;
  meta.nip05 = `${user.username}@${Conf.url.host}` ?? meta.nip05;

  const event = await createEvent({
    kind: 0,
    content: JSON.stringify(meta),
    tags: [],
  }, c);

  const account = await renderAccount(event);
  return c.json(account);
};

const followController: AppController = async (c) => {
  const sourcePubkey = c.get('pubkey')!;
  const targetPubkey = c.req.param('pubkey');

  await updateListEvent(
    { kinds: [3], authors: [sourcePubkey] },
    (tags) => addTag(tags, ['p', targetPubkey]),
    c,
  );

  const relationship = await renderRelationship(sourcePubkey, targetPubkey);
  return c.json(relationship);
};

const followersController: AppController = (c) => {
  const pubkey = c.req.param('pubkey');
  const params = paginationSchema.parse(c.req.query());
  return renderEventAccounts(c, [{ kinds: [3], '#p': [pubkey], ...params }]);
};

const followingController: AppController = async (c) => {
  const pubkey = c.req.param('pubkey');
  const pubkeys = await getFollowedPubkeys(pubkey);
  return renderAccounts(c, pubkeys);
};

/** https://docs.joinmastodon.org/methods/accounts/#block */
const blockController: AppController = async (c) => {
  const sourcePubkey = c.get('pubkey')!;
  const targetPubkey = c.req.param('pubkey');

  await updateListEvent(
    { kinds: [10000], authors: [sourcePubkey] },
    (tags) => addTag(tags, ['p', targetPubkey]),
    c,
  );

  const relationship = await renderRelationship(sourcePubkey, targetPubkey);
  return c.json(relationship);
};

const favouritesController: AppController = async (c) => {
  const pubkey = c.get('pubkey')!;
  const params = paginationSchema.parse(c.req.query());

  const events7 = await eventsDB.getEvents(
    [{ kinds: [7], authors: [pubkey], ...params }],
    { signal: AbortSignal.timeout(1000) },
  );

  const ids = events7
    .map((event) => event.tags.find((tag) => tag[0] === 'e')?.[1])
    .filter((id): id is string => !!id);

  const events1 = await eventsDB.getEvents(
    [{ kinds: [1], ids, relations: ['author', 'event_stats', 'author_stats'] }],
    {
      signal: AbortSignal.timeout(1000),
    },
  );

  const statuses = await Promise.all(events1.map((event) => renderStatus(event, c.get('pubkey'))));
  return paginated(c, events1, statuses);
};

export {
  accountController,
  accountLookupController,
  accountSearchController,
  accountStatusesController,
  blockController,
  createAccountController,
  favouritesController,
  followController,
  followersController,
  followingController,
  relationshipsController,
  updateCredentialsController,
  verifyCredentialsController,
};

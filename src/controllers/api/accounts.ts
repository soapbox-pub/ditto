import { NostrFilter } from '@soapbox/nspec';
import { type AppController } from '@/app.ts';
import { Conf } from '@/config.ts';
import { nip19, z } from '@/deps.ts';
import { getAuthor, getFollowedPubkeys } from '@/queries.ts';
import { booleanParamSchema, fileSchema } from '@/schema.ts';
import { jsonMetaContentSchema } from '@/schemas/nostr.ts';
import { eventsDB, searchStore } from '@/storages.ts';
import { addTag, deleteTag, findReplyTag, getTagSet } from '@/tags.ts';
import { uploadFile } from '@/upload.ts';
import { nostrNow } from '@/utils.ts';
import { createEvent, paginated, paginationSchema, parseBody, updateListEvent } from '@/utils/api.ts';
import { lookupAccount } from '@/utils/lookup.ts';
import { renderAccounts, renderEventAccounts, renderStatuses } from '@/views.ts';
import { accountFromPubkey, renderAccount } from '@/views/mastodon/accounts.ts';
import { renderRelationship } from '@/views/mastodon/relationships.ts';
import { renderStatus } from '@/views/mastodon/statuses.ts';
import { hydrateEvents } from '@/storages/hydrate.ts';

const usernameSchema = z
  .string().min(1).max(30)
  .regex(/^[a-z0-9_]+$/i)
  .refine((username) => !Conf.forbiddenUsernames.includes(username), 'Username is reserved.');

const createAccountSchema = z.object({
  username: usernameSchema,
});

const createAccountController: AppController = async (c) => {
  const pubkey = c.get('pubkey')!;
  const result = createAccountSchema.safeParse(await c.req.json());

  if (!result.success) {
    return c.json({ error: 'Bad request', schema: result.error }, 400);
  }

  return c.json({
    access_token: nip19.npubEncode(pubkey),
    token_type: 'Bearer',
    scope: 'read write follow push',
    created_at: nostrNow(),
  });
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
  } else {
    return c.json(await accountFromPubkey(pubkey));
  }
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

  const query = decodeURIComponent(q);

  const [event, events] = await Promise.all([
    lookupAccount(query),
    searchStore.query([{ kinds: [0], search: query, limit: 20 }], { signal: c.req.raw.signal }),
  ]);

  const results = await hydrateEvents({
    events: event ? [event, ...events] : events,
    relations: ['author_stats'],
    storage: eventsDB,
    signal: c.req.raw.signal,
  });

  const accounts = await Promise.all(results.map((event) => renderAccount(event)));
  return c.json(accounts);
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
  const { signal } = c.req.raw;

  if (pinned) {
    const [pinEvent] = await eventsDB.query([{ kinds: [10001], authors: [pubkey], limit: 1 }], { signal });
    if (pinEvent) {
      const pinnedEventIds = getTagSet(pinEvent.tags, 'e');
      return renderStatuses(c, [...pinnedEventIds].reverse());
    } else {
      return c.json([]);
    }
  }

  const filter: NostrFilter = {
    authors: [pubkey],
    kinds: [1],
    since,
    until,
    limit,
  };

  if (tagged) {
    filter['#t'] = [tagged];
  }

  const events = await eventsDB.query([filter], { signal })
    .then((events) =>
      hydrateEvents({ events, relations: ['author', 'event_stats', 'author_stats'], storage: eventsDB, signal })
    )
    .then((events) => {
      if (exclude_replies) {
        return events.filter((event) => !findReplyTag(event.tags));
      }
      return events;
    });

  const statuses = await Promise.all(events.map((event) => renderStatus(event, { viewerPubkey: c.get('pubkey') })));
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
  nip05: z.string().optional(),
});

const updateCredentialsController: AppController = async (c) => {
  const pubkey = c.get('pubkey')!;
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
    nip05,
  } = result.data;

  const [avatar, header] = await Promise.all([
    avatarFile ? uploadFile(avatarFile, { pubkey }) : undefined,
    headerFile ? uploadFile(headerFile, { pubkey }) : undefined,
  ]);

  meta.name = display_name ?? meta.name;
  meta.about = note ?? meta.about;
  meta.picture = avatar?.url ?? meta.picture;
  meta.banner = header?.url ?? meta.banner;
  meta.nip05 = nip05 ?? meta.nip05;

  const event = await createEvent({
    kind: 0,
    content: JSON.stringify(meta),
    tags: [],
  }, c);

  const account = await renderAccount(event, { withSource: true });
  return c.json(account);
};

/** https://docs.joinmastodon.org/methods/accounts/#follow */
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

/** https://docs.joinmastodon.org/methods/accounts/#unfollow */
const unfollowController: AppController = async (c) => {
  const sourcePubkey = c.get('pubkey')!;
  const targetPubkey = c.req.param('pubkey');

  await updateListEvent(
    { kinds: [3], authors: [sourcePubkey] },
    (tags) => deleteTag(tags, ['p', targetPubkey]),
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

/** https://docs.joinmastodon.org/methods/accounts/#unblock */
const unblockController: AppController = async (c) => {
  const sourcePubkey = c.get('pubkey')!;
  const targetPubkey = c.req.param('pubkey');

  await updateListEvent(
    { kinds: [10000], authors: [sourcePubkey] },
    (tags) => deleteTag(tags, ['p', targetPubkey]),
    c,
  );

  const relationship = await renderRelationship(sourcePubkey, targetPubkey);
  return c.json(relationship);
};

const favouritesController: AppController = async (c) => {
  const pubkey = c.get('pubkey')!;
  const params = paginationSchema.parse(c.req.query());
  const { signal } = c.req.raw;

  const events7 = await eventsDB.query(
    [{ kinds: [7], authors: [pubkey], ...params }],
    { signal },
  );

  const ids = events7
    .map((event) => event.tags.find((tag) => tag[0] === 'e')?.[1])
    .filter((id): id is string => !!id);

  const events1 = await eventsDB.query([{ kinds: [1], ids }], { signal })
    .then((events) =>
      hydrateEvents({ events, relations: ['author', 'event_stats', 'author_stats'], storage: eventsDB, signal })
    );

  const statuses = await Promise.all(events1.map((event) => renderStatus(event, { viewerPubkey: c.get('pubkey') })));
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
  unblockController,
  unfollowController,
  updateCredentialsController,
  verifyCredentialsController,
};

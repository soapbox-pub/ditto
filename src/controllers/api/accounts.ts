import { type AppController } from '@/app.ts';
import { type Filter, findReplyTag, z } from '@/deps.ts';
import { getAuthor, getFilter, getFollows, publish } from '@/client.ts';
import { parseMetaContent } from '@/schema.ts';
import { signEvent } from '@/sign.ts';
import { toAccount, toStatus } from '@/transmute.ts';
import { buildLinkHeader, eventDateComparator, lookupAccount, paginationSchema, parseBody } from '@/utils.ts';

const createAccountController: AppController = (c) => {
  return c.json({ error: 'Please log in with Nostr.' }, 405);
};

const verifyCredentialsController: AppController = async (c) => {
  const pubkey = c.get('pubkey')!;

  const event = await getAuthor(pubkey);
  if (event) {
    return c.json(await toAccount(event, { withSource: true }));
  }

  return c.json({ error: 'Could not find user.' }, 404);
};

const accountController: AppController = async (c) => {
  const pubkey = c.req.param('pubkey');

  const event = await getAuthor(pubkey);
  if (event) {
    return c.json(await toAccount(event));
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
    return c.json(await toAccount(event));
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
    return c.json([await toAccount(event)]);
  }

  return c.json([]);
};

const relationshipsController: AppController = async (c) => {
  const pubkey = c.get('pubkey')!;
  const ids = z.array(z.string()).safeParse(c.req.queries('id[]'));

  if (!ids.success) {
    return c.json({ error: 'Missing `id[]` query parameters.' }, 422);
  }

  const follows = await getFollows(pubkey);

  const result = ids.data.map((id) => ({
    id,
    following: !!follows?.tags.find((tag) => tag[0] === 'p' && ids.data.includes(tag[1])),
    showing_reblogs: false,
    notifying: false,
    followed_by: false,
    blocking: false,
    blocked_by: false,
    muting: false,
    muting_notifications: false,
    requested: false,
    domain_blocking: false,
    endorsed: false,
  }));

  return c.json(result);
};

/** https://github.com/colinhacks/zod/issues/1630#issuecomment-1365983831 */
const booleanParamSchema = z.enum(['true', 'false']).transform((value) => value === 'true');

const accountStatusesQuerySchema = z.object({
  pinned: booleanParamSchema.optional(),
  limit: z.coerce.number().positive().transform((v) => Math.min(v, 40)).catch(20),
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

  const filter: Filter<1> = { authors: [pubkey], kinds: [1], since, until, limit };
  if (tagged) {
    filter['#t'] = [tagged];
  }

  let events = await getFilter(filter);
  events.sort(eventDateComparator);

  if (exclude_replies) {
    events = events.filter((event) => !findReplyTag(event));
  }

  const statuses = await Promise.all(events.map(toStatus));

  const link = buildLinkHeader(c.req.url, events);
  return c.json(statuses, 200, link ? { link } : undefined);
};

const fileSchema = z.custom<File>((value) => value instanceof File);

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
  const body = await parseBody(c.req.raw);
  const result = updateCredentialsSchema.safeParse(body);

  if (!result.success) {
    return c.json(result.error, 422);
  }

  const author = await getAuthor(pubkey);
  if (!author) {
    return c.json({ error: 'Could not find user.' }, 404);
  }

  const meta = parseMetaContent(author);
  meta.name = result.data.display_name ?? meta.name;
  meta.about = result.data.note ?? meta.about;

  const event = await signEvent({
    kind: 0,
    content: JSON.stringify(meta),
    tags: [],
    created_at: Math.floor(new Date().getTime() / 1000),
  }, c);

  publish(event);

  const account = await toAccount(event);
  return c.json(account);
};

export {
  accountController,
  accountLookupController,
  accountSearchController,
  accountStatusesController,
  createAccountController,
  relationshipsController,
  updateCredentialsController,
  verifyCredentialsController,
};

import { paginationMiddleware, userMiddleware } from '@ditto/mastoapi/middleware';
import { DittoRoute } from '@ditto/mastoapi/router';
import { z } from 'zod';

import { createEvent } from '@/utils/api.ts';
import { hydrateEvents } from '@/storages/hydrate.ts';
import { renderNameRequest } from '@/views/ditto.ts';
import { booleanParamSchema } from '@/schema.ts';
import { NostrFilter } from '@nostrify/nostrify';

const nameRequestSchema = z.object({
  name: z.string().email(),
  reason: z.string().max(500).optional(),
});

const route = new DittoRoute();

route.post('/', userMiddleware(), async (c) => {
  const { conf, relay, user } = c.var;

  const result = nameRequestSchema.safeParse(await c.req.json());

  if (!result.success) {
    return c.json({ error: 'Invalid username', schema: result.error }, 422);
  }

  const pubkey = await user.signer.getPublicKey();
  const adminPubkey = await conf.signer.getPublicKey();

  const { name, reason } = result.data;
  const [_localpart, domain] = name.split('@');

  if (domain.toLowerCase() !== conf.url.host.toLowerCase()) {
    return c.json({ error: 'Unsupported domain' }, 422);
  }

  const d = name.toLowerCase();

  const [grant] = await relay.query([{ kinds: [30360], authors: [adminPubkey], '#d': [d] }]);
  if (grant) {
    return c.json({ error: 'Name has already been granted' }, 400);
  }

  const [pending] = await relay.query([{
    kinds: [30383],
    authors: [adminPubkey],
    '#p': [pubkey],
    '#k': ['3036'],
    '#r': [d],
    '#n': ['pending'],
    limit: 1,
  }]);
  if (pending) {
    return c.json({ error: 'You have already requested that name, and it is pending approval by staff' }, 400);
  }

  const tags: string[][] = [['r', name]];

  if (name !== name.toLowerCase()) {
    tags.push(['r', name.toLowerCase()]);
  }

  const event = await createEvent({
    kind: 3036,
    content: reason,
    tags: [
      ...tags,
      ['L', 'nip05.domain'],
      ['l', domain.toLowerCase(), 'nip05.domain'],
      ['p', await conf.signer.getPublicKey()],
    ],
  }, c);

  await hydrateEvents({ ...c.var, events: [event] });

  const nameRequest = await renderNameRequest(event);
  return c.json(nameRequest);
});

const nameRequestsSchema = z.object({
  approved: booleanParamSchema.optional(),
  rejected: booleanParamSchema.optional(),
});

route.get('/', paginationMiddleware(), userMiddleware(), async (c) => {
  const { conf, relay, user, pagination } = c.var;
  const pubkey = await user!.signer.getPublicKey();

  const { approved, rejected } = nameRequestsSchema.parse(c.req.query());

  const filter: NostrFilter = {
    kinds: [30383],
    authors: [await conf.signer.getPublicKey()],
    '#k': ['3036'],
    '#p': [pubkey],
    ...pagination,
  };

  if (approved) {
    filter['#n'] = ['approved'];
  }
  if (rejected) {
    filter['#n'] = ['rejected'];
  }

  const orig = await relay.query([filter]);
  const ids = new Set<string>();

  for (const event of orig) {
    const d = event.tags.find(([name]) => name === 'd')?.[1];
    if (d) {
      ids.add(d);
    }
  }

  if (!ids.size) {
    return c.json([]);
  }

  const events = await relay.query([{ kinds: [3036], ids: [...ids], authors: [pubkey] }])
    .then((events) => hydrateEvents({ ...c.var, events }));

  const nameRequests = await Promise.all(
    events.map((event) => renderNameRequest(event)),
  );

  return c.var.paginate(orig, nameRequests);
});

export default route;

import { NostrEvent, NostrFilter, NSchema as n } from '@nostrify/nostrify';
import { z } from 'zod';

import { AppController } from '@/app.ts';
import { Conf } from '@/config.ts';
import { booleanParamSchema } from '@/schema.ts';
import { AdminSigner } from '@/signers/AdminSigner.ts';
import { Storages } from '@/storages.ts';
import { hydrateEvents } from '@/storages/hydrate.ts';
import { createAdminEvent, createEvent, paginated, paginationSchema, updateEventInfo } from '@/utils/api.ts';
import { renderNameRequest } from '@/views/ditto.ts';

const markerSchema = z.enum(['read', 'write']);

const relaySchema = z.object({
  url: z.string().url(),
  marker: markerSchema.optional(),
});

type RelayEntity = z.infer<typeof relaySchema>;

export const adminRelaysController: AppController = async (c) => {
  const store = await Storages.db();

  const [event] = await store.query([
    { kinds: [10002], authors: [Conf.pubkey], limit: 1 },
  ]);

  if (!event) {
    return c.json([]);
  }

  return c.json(renderRelays(event));
};

export const adminSetRelaysController: AppController = async (c) => {
  const store = await Storages.db();
  const relays = relaySchema.array().parse(await c.req.json());

  const event = await new AdminSigner().signEvent({
    kind: 10002,
    tags: relays.map(({ url, marker }) => marker ? ['r', url, marker] : ['r', url]),
    content: '',
    created_at: Math.floor(Date.now() / 1000),
  });

  await store.event(event);

  return c.json(renderRelays(event));
};

/** Render Ditto API relays from a NIP-65 event. */
function renderRelays(event: NostrEvent): RelayEntity[] {
  return event.tags.reduce((acc, [name, url, marker]) => {
    if (name === 'r') {
      const relay: RelayEntity = {
        url,
        marker: markerSchema.safeParse(marker).success ? marker as 'read' | 'write' : undefined,
      };
      acc.push(relay);
    }
    return acc;
  }, [] as RelayEntity[]);
}

const nameRequestSchema = z.object({
  nip05: z.string().email(),
  reason: z.string().max(500).optional(),
});

export const nameRequestController: AppController = async (c) => {
  const { nip05, reason } = nameRequestSchema.parse(await c.req.json());

  const event = await createEvent({
    kind: 3036,
    content: reason,
    tags: [
      ['r', nip05],
      ['L', 'nip05.domain'],
      ['l', nip05.split('@')[1], 'nip05.domain'],
      ['p', Conf.pubkey],
    ],
  }, c);

  await hydrateEvents({ events: [event], store: await Storages.db() });

  const nameRequest = await renderNameRequest(event);
  return c.json(nameRequest);
};

const nameRequestsSchema = z.object({
  approved: booleanParamSchema.optional(),
  rejected: booleanParamSchema.optional(),
});

export const nameRequestsController: AppController = async (c) => {
  const store = await Storages.db();
  const signer = c.get('signer')!;
  const pubkey = await signer.getPublicKey();

  const params = paginationSchema.parse(c.req.query());
  const { approved, rejected } = nameRequestsSchema.parse(c.req.query());

  const filter: NostrFilter = {
    kinds: [30383],
    authors: [Conf.pubkey],
    '#k': ['3036'],
    '#p': [pubkey],
    ...params,
  };

  if (approved) {
    filter['#n'] = ['approved'];
  }
  if (rejected) {
    filter['#n'] = ['rejected'];
  }

  const orig = await store.query([filter]);
  const ids = new Set<string>();

  for (const event of orig) {
    const d = event.tags.find(([name]) => name === 'd')?.[1];
    if (d) {
      ids.add(d);
    }
  }

  const events = await store.query([{ kinds: [3036], ids: [...ids] }])
    .then((events) => hydrateEvents({ store, events: events, signal: c.req.raw.signal }));

  const nameRequests = await Promise.all(
    events.map((event) => renderNameRequest(event)),
  );

  return paginated(c, orig, nameRequests);
};

const adminNameRequestsSchema = z.object({
  account_id: n.id().optional(),
  approved: booleanParamSchema.optional(),
  rejected: booleanParamSchema.optional(),
});

export const adminNameRequestsController: AppController = async (c) => {
  const store = await Storages.db();
  const params = paginationSchema.parse(c.req.query());
  const { account_id, approved, rejected } = adminNameRequestsSchema.parse(c.req.query());

  const filter: NostrFilter = {
    kinds: [30383],
    authors: [Conf.pubkey],
    '#k': ['3036'],
    ...params,
  };

  if (account_id) {
    filter['#p'] = [account_id];
  }
  if (approved) {
    filter['#n'] = ['approved'];
  }
  if (rejected) {
    filter['#n'] = ['rejected'];
  }

  const orig = await store.query([filter]);
  const ids = new Set<string>();

  for (const event of orig) {
    const d = event.tags.find(([name]) => name === 'd')?.[1];
    if (d) {
      ids.add(d);
    }
  }

  const events = await store.query([{ kinds: [3036], ids: [...ids] }])
    .then((events) => hydrateEvents({ store, events: events, signal: c.req.raw.signal }));

  const nameRequests = await Promise.all(
    events.map((event) => renderNameRequest(event)),
  );

  return paginated(c, orig, nameRequests);
};

export const adminNameApproveController: AppController = async (c) => {
  const eventId = c.req.param('id');
  const store = await Storages.db();

  const [event] = await store.query([{ kinds: [3036], ids: [eventId] }]);
  if (!event) {
    return c.json({ error: 'Event not found' }, 404);
  }

  const r = event.tags.find(([name]) => name === 'r')?.[1];
  if (!r) {
    return c.json({ error: 'NIP-05 not found' }, 404);
  }
  if (!z.string().email().safeParse(r).success) {
    return c.json({ error: 'Invalid NIP-05' }, 400);
  }

  const [existing] = await store.query([{ kinds: [30360], authors: [Conf.pubkey], '#d': [r], limit: 1 }]);
  if (existing) {
    return c.json({ error: 'NIP-05 already granted to another user' }, 400);
  }

  await createAdminEvent({
    kind: 30360,
    tags: [
      ['d', r],
      ['L', 'nip05.domain'],
      ['l', r.split('@')[1], 'nip05.domain'],
      ['p', event.pubkey],
    ],
  }, c);

  await updateEventInfo(eventId, { pending: false, approved: true, rejected: false }, c);
  await hydrateEvents({ events: [event], store });

  const nameRequest = await renderNameRequest(event);
  return c.json(nameRequest);
};

export const adminNameRejectController: AppController = async (c) => {
  const eventId = c.req.param('id');
  const store = await Storages.db();

  const [event] = await store.query([{ kinds: [3036], ids: [eventId] }]);
  if (!event) {
    return c.json({ error: 'Event not found' }, 404);
  }

  await updateEventInfo(eventId, { pending: false, approved: false, rejected: true }, c);
  await hydrateEvents({ events: [event], store });

  const nameRequest = await renderNameRequest(event);
  return c.json(nameRequest);
};

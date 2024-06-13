import { NostrEvent, NostrFilter } from '@nostrify/nostrify';
import { z } from 'zod';

import { AppController } from '@/app.ts';
import { Conf } from '@/config.ts';
import { booleanParamSchema } from '@/schema.ts';
import { AdminSigner } from '@/signers/AdminSigner.ts';
import { Storages } from '@/storages.ts';
import { hydrateEvents } from '@/storages/hydrate.ts';
import { createEvent, paginated, paginationSchema } from '@/utils/api.ts';
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
  name: z.string().email(),
  reason: z.string().max(500).optional(),
});

export const nameRequestController: AppController = async (c) => {
  const { name, reason } = nameRequestSchema.parse(await c.req.json());

  const event = await createEvent({
    kind: 3036,
    content: reason,
    tags: [
      ['r', name],
      ['L', 'nip05.domain'],
      ['l', name.split('@')[1], 'nip05.domain'],
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

  if (!ids.size) {
    return c.json([]);
  }

  const events = await store.query([{ kinds: [3036], ids: [...ids], authors: [pubkey] }])
    .then((events) => hydrateEvents({ store, events: events, signal: c.req.raw.signal }));

  const nameRequests = await Promise.all(
    events.map((event) => renderNameRequest(event)),
  );

  return paginated(c, orig, nameRequests);
};

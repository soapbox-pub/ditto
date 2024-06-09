import { NostrEvent } from '@nostrify/nostrify';
import { z } from 'zod';

import { AppController } from '@/app.ts';
import { Conf } from '@/config.ts';
import { AdminSigner } from '@/signers/AdminSigner.ts';
import { Storages } from '@/storages.ts';
import { hydrateEvents } from '@/storages/hydrate.ts';
import { createEvent } from '@/utils/api.ts';
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

export const nameRequestsController: AppController = async (c) => {
  const store = await Storages.db();
  const signer = c.get('signer')!;
  const pubkey = await signer.getPublicKey();

  const events = await store.query([{ kinds: [3036], authors: [pubkey], limit: 20 }])
    .then((events) => hydrateEvents({ events, store }));

  const nameRequests = await Promise.all(events.map(renderNameRequest));
  return c.json(nameRequests);
};

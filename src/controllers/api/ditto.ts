import { NostrEvent } from '@nostrify/nostrify';
import { z } from 'zod';

import { AppController } from '@/app.ts';
import { Conf } from '@/config.ts';
import { eventsDB } from '@/storages.ts';
import { AdminSigner } from '@/signers/AdminSigner.ts';

const relaySchema = z.object({
  url: z.string().url(),
  read: z.boolean(),
  write: z.boolean(),
});

type RelayEntity = z.infer<typeof relaySchema>;

export const adminRelaysController: AppController = async (c) => {
  const [event] = await eventsDB.query([
    { kinds: [10002], authors: [Conf.pubkey], limit: 1 },
  ]);

  if (!event) {
    return c.json([]);
  }

  return c.json(renderRelays(event));
};

export const adminSetRelaysController: AppController = async (c) => {
  const relays = relaySchema.array().parse(await c.req.json());

  const event = await new AdminSigner().signEvent({
    kind: 10002,
    tags: relays.map(({ url, read, write }) => ['r', url, read && write ? '' : read ? 'read' : 'write']),
    content: '',
    created_at: Math.floor(Date.now() / 1000),
  });

  await eventsDB.event(event);

  return c.json(renderRelays(event));
};

/** Render Ditto API relays from a NIP-65 event. */
function renderRelays(event: NostrEvent): RelayEntity[] {
  return event.tags.reduce((acc, [name, url, marker]) => {
    if (name === 'r') {
      const relay: RelayEntity = {
        url,
        read: !marker || marker === 'read',
        write: !marker || marker === 'write',
      };
      acc.push(relay);
    }
    return acc;
  }, [] as RelayEntity[]);
}

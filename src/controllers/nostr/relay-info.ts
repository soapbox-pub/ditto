import { AppController } from '@/app.ts';
import { Conf } from '@/config.ts';
import { jsonServerMetaSchema } from '@/schemas/nostr.ts';
import { eventsDB } from '@/storages.ts';

const relayInfoController: AppController = async (c) => {
  const [event] = await eventsDB.filter([{ kinds: [0], authors: [Conf.pubkey], limit: 1 }]);
  const meta = jsonServerMetaSchema.parse(event?.content);

  return c.json({
    name: meta.name ?? 'Ditto',
    description: meta.about ?? 'Nostr and the Fediverse.',
    pubkey: Conf.pubkey,
    contact: `mailto:${meta.email ?? `postmaster@${Conf.url.host}`}`,
    supported_nips: [1, 5, 9, 11, 16, 45, 50, 46, 98],
    software: 'Ditto',
    version: '0.0.0',
    limitation: {
      // TODO.
    },
  });
};

export { relayInfoController };

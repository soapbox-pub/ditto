import { AppController } from '@/app.ts';
import { Conf } from '@/config.ts';
import { Storages } from '@/storages.ts';
import { getInstanceMetadata } from '@/utils/instance.ts';

const relayInfoController: AppController = async (c) => {
  const store = await Storages.db();
  const meta = await getInstanceMetadata(store, c.req.raw.signal);

  return c.json({
    name: meta.name,
    description: meta.about,
    pubkey: Conf.pubkey,
    contact: meta.email,
    supported_nips: [1, 5, 9, 11, 16, 45, 50, 46, 98],
    software: 'Ditto',
    version: '0.0.0',
    limitation: {
      // TODO.
    },
  });
};

export { relayInfoController };

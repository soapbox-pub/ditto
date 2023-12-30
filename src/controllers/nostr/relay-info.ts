import { AppController } from '@/app.ts';
import { Conf } from '@/config.ts';

const relayInfoController: AppController = (c) => {
  return c.json({
    name: 'Ditto',
    description: 'Nostr and the Fediverse.',
    pubkey: Conf.pubkey,
    contact: `mailto:${Conf.adminEmail}`,
    supported_nips: [1, 5, 9, 11, 16, 45, 46, 98],
    software: 'Ditto',
    version: '0.0.0',
    limitation: {
      // TODO.
    },
  });
};

export { relayInfoController };

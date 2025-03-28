import denoJson from 'deno.json' with { type: 'json' };

import { AppController } from '@/app.ts';
import { getInstanceMetadata } from '@/utils/instance.ts';

const relayInfoController: AppController = async (c) => {
  const { conf } = c.var;

  const meta = await getInstanceMetadata(c.var);

  c.res.headers.set('access-control-allow-origin', '*');
  c.res.headers.set('access-control-allow-headers', '*');
  c.res.headers.set('access-control-allow-methods', 'GET, POST, OPTIONS');

  return c.json({
    name: meta.name,
    description: meta.about,
    pubkey: await conf.signer.getPublicKey(),
    contact: meta.email,
    supported_nips: [1, 5, 9, 11, 16, 45, 50, 46, 98],
    software: 'https://gitlab.com/soapbox-pub/ditto',
    version: denoJson.version,
    limitation: {
      auth_required: false,
      created_at_lower_limit: 0,
      created_at_upper_limit: 2_147_483_647,
      max_limit: 100,
      payment_required: false,
      restricted_writes: false,
    },
  });
};

export { relayInfoController };

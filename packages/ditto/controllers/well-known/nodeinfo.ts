import type { AppController } from '@/app.ts';

const nodeInfoController: AppController = (c) => {
  const { conf } = c.var;

  return c.json({
    links: [
      {
        rel: 'http://nodeinfo.diaspora.software/ns/schema/2.0',
        href: conf.local('/nodeinfo/2.0'),
      },
      {
        rel: 'http://nodeinfo.diaspora.software/ns/schema/2.1',
        href: conf.local('/nodeinfo/2.1'),
      },
    ],
  });
};

const nodeInfoSchemaController: AppController = (c) => {
  return c.json({
    version: '2.1',
    software: {
      name: 'ditto',
      version: '0.0.0',
      repository: 'https://gitlab.com/soapbox-pub/ditto',
      homepage: 'https://soapbox.pub',
    },
    protocols: [
      'activitypub',
    ],
    services: {
      inbound: [],
      outbound: [],
    },
    openRegistrations: true,
    usage: {
      users: {
        total: 0,
        activeMonth: 0,
        activeHalfyear: 0,
      },
      localPosts: 0,
      localComments: 0,
    },
    metadata: {
      features: [
        'nip05',
        'nostr_bridge',
      ],
    },
  });
};

export { nodeInfoController, nodeInfoSchemaController };

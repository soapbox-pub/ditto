import { Conf } from '@/config.ts';

import type { Context } from '@/deps.ts';

function instanceController(c: Context) {
  const { host, protocol } = Conf.url;

  return c.json({
    uri: host,
    title: 'Ditto',
    description: 'An efficient and flexible social media server.',
    short_description: 'An efficient and flexible social media server.',
    registrations: false,
    max_toot_chars: Conf.postCharLimit,
    configuration: {
      media_attachments: {
        image_size_limit: 100000000,
        video_size_limit: 100000000,
      },
      polls: {
        max_characters_per_option: 0,
        max_expiration: 0,
        max_options: 0,
        min_expiration: 0,
      },
      statuses: {
        max_characters: Conf.postCharLimit,
        max_media_attachments: 20,
      },
    },
    languages: ['en'],
    stats: {
      domain_count: 0,
      status_count: 0,
      user_count: 0,
    },
    urls: {
      streaming_api: `${protocol === 'http:' ? 'ws:' : 'wss:'}//${host}`,
    },
    version: '0.0.0 (compatible; Ditto 0.0.1)',
    email: Conf.adminEmail,
    rules: [],
  });
}

export default instanceController;

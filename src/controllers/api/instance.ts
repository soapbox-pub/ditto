import { type AppController } from '@/app.ts';
import { Conf } from '@/config.ts';

const instanceController: AppController = (c) => {
  const { host, protocol } = Conf.url;

  /** Protocol to use for WebSocket URLs, depending on the protocol of the `LOCAL_DOMAIN`. */
  const wsProtocol = protocol === 'http:' ? 'ws:' : 'wss:';

  return c.json({
    uri: host,
    title: 'Ditto',
    description: 'Nostr and the Fediverse',
    short_description: 'Nostr and the Fediverse',
    registrations: Conf.registrations,
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
    pleroma: {
      metadata: {
        features: [
          'mastodon_api',
          'mastodon_api_streaming',
          'exposable_reactions',
        ],
      },
    },
    languages: ['en'],
    stats: {
      domain_count: 0,
      status_count: 0,
      user_count: 0,
    },
    urls: {
      streaming_api: `${wsProtocol}//${host}`,
    },
    version: '0.0.0 (compatible; Ditto 0.0.1)',
    email: Conf.adminEmail,
    nostr: {
      pubkey: Conf.pubkey,
      relay: `${wsProtocol}//${host}/relay`,
      pow: {
        registrations: Conf.pow.registrations,
      },
    },
    rules: [],
  });
};

export { instanceController };

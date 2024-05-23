import { AppController } from '@/app.ts';
import { Conf } from '@/config.ts';
import { Storages } from '@/storages.ts';
import { getInstanceMetadata } from '@/utils/instance.ts';

const instanceController: AppController = async (c) => {
  const { host, protocol } = Conf.url;
  const meta = await getInstanceMetadata(await Storages.db(), c.req.raw.signal);

  /** Protocol to use for WebSocket URLs, depending on the protocol of the `LOCAL_DOMAIN`. */
  const wsProtocol = protocol === 'http:' ? 'ws:' : 'wss:';

  return c.json({
    uri: host,
    title: meta.name,
    description: meta.about,
    short_description: meta.tagline,
    registrations: true,
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
          'exposable_reactions',
          'mastodon_api',
          'mastodon_api_streaming',
          'pleroma_emoji_reactions',
          'quote_posting',
          'v2_suggestions',
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
    email: meta.email,
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

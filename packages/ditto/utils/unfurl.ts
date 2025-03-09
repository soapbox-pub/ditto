import { logi } from '@soapbox/logi';
import { safeFetch } from '@soapbox/safe-fetch';
import DOMPurify from 'isomorphic-dompurify';
import { unfurl } from 'unfurl.js';

import { errorJson } from '@/utils/log.ts';

import type { DittoConf } from '@ditto/conf';
import type { MastodonPreviewCard } from '@ditto/mastoapi/types';

interface UnfurlCardOpts {
  conf: DittoConf;
  signal?: AbortSignal;
}

export async function unfurlCard(url: string, opts: UnfurlCardOpts): Promise<MastodonPreviewCard | null> {
  const { conf, signal } = opts;
  try {
    const result = await unfurl(url, {
      fetch: (url) =>
        safeFetch(url, {
          headers: {
            'Accept': 'text/html, application/xhtml+xml',
            'User-Agent': conf.fetchUserAgent,
          },
          signal,
        }),
    });

    const { oEmbed, title, description, canonical_url, open_graph } = result;

    const card = {
      type: oEmbed?.type || 'link',
      url: canonical_url || url,
      title: oEmbed?.title || title || '',
      description: open_graph?.description || description || '',
      author_name: oEmbed?.author_name || '',
      author_url: oEmbed?.author_url || '',
      provider_name: oEmbed?.provider_name || '',
      provider_url: oEmbed?.provider_url || '',
      // @ts-expect-error `html` does in fact exist on oEmbed.
      html: DOMPurify.sanitize(oEmbed?.html || '', {
        ALLOWED_TAGS: ['iframe'],
        ALLOWED_ATTR: ['src', 'width', 'height', 'frameborder', 'allowfullscreen'],
      }),
      width: ((oEmbed && oEmbed.type !== 'link') ? oEmbed.width : 0) || 0,
      height: ((oEmbed && oEmbed.type !== 'link') ? oEmbed.height : 0) || 0,
      image: oEmbed?.thumbnails?.[0].url || open_graph?.images?.[0].url || null,
      embed_url: '',
      blurhash: null,
    };

    logi({ level: 'info', ns: 'ditto.unfurl', url, success: true });

    return card;
  } catch (e) {
    logi({ level: 'info', ns: 'ditto.unfurl', url, success: false, error: errorJson(e) });
    return null;
  }
}

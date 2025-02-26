import { cachedLinkPreviewSizeGauge } from '@ditto/metrics';
import TTLCache from '@isaacs/ttlcache';
import { logi } from '@soapbox/logi';
import { safeFetch } from '@soapbox/safe-fetch';
import DOMPurify from 'isomorphic-dompurify';
import { unfurl } from 'unfurl.js';

import { Conf } from '@/config.ts';
import { errorJson } from '@/utils/log.ts';

import type { MastodonPreviewCard } from '@ditto/mastoapi/types';

async function unfurlCard(url: string, signal: AbortSignal): Promise<MastodonPreviewCard | null> {
  try {
    const result = await unfurl(url, {
      fetch: (url) =>
        safeFetch(url, {
          headers: {
            'Accept': 'text/html, application/xhtml+xml',
            'User-Agent': Conf.fetchUserAgent,
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

/** TTL cache for preview cards. */
const previewCardCache = new TTLCache<string, Promise<MastodonPreviewCard | null>>(Conf.caches.linkPreview);

/** Unfurl card from cache if available, otherwise fetch it. */
export function unfurlCardCached(url: string, signal = AbortSignal.timeout(1000)): Promise<MastodonPreviewCard | null> {
  const cached = previewCardCache.get(url);
  if (cached !== undefined) {
    return cached;
  } else {
    const card = unfurlCard(url, signal);
    previewCardCache.set(url, card);
    cachedLinkPreviewSizeGauge.set(previewCardCache.size);
    return card;
  }
}

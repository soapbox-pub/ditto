import TTLCache from '@isaacs/ttlcache';
import Debug from '@soapbox/stickynotes/debug';
import { unfurl } from 'unfurl.js';

import { sanitizeHtml } from '@/deps.ts';
import { Time } from '@/utils/time.ts';
import { fetchWorker } from '@/workers/fetch.ts';

const debug = Debug('ditto:unfurl');

interface PreviewCard {
  url: string;
  title: string;
  description: string;
  type: 'link' | 'photo' | 'video' | 'rich';
  author_name: string;
  author_url: string;
  provider_name: string;
  provider_url: string;
  html: string;
  width: number;
  height: number;
  image: string | null;
  embed_url: string;
  blurhash: string | null;
}

async function unfurlCard(url: string, signal: AbortSignal): Promise<PreviewCard | null> {
  debug(`Unfurling ${url}...`);
  try {
    const result = await unfurl(url, {
      fetch: (url) => fetchWorker(url, { signal }),
    });

    const { oEmbed, title, description, canonical_url, open_graph } = result;

    return {
      type: oEmbed?.type || 'link',
      url: canonical_url || url,
      title: oEmbed?.title || title || '',
      description: open_graph?.description || description || '',
      author_name: oEmbed?.author_name || '',
      author_url: oEmbed?.author_url || '',
      provider_name: oEmbed?.provider_name || '',
      provider_url: oEmbed?.provider_url || '',
      // @ts-expect-error `html` does in fact exist on oEmbed.
      html: sanitizeHtml(oEmbed?.html || '', {
        allowedTags: ['iframe'],
        allowedAttributes: {
          iframe: ['width', 'height', 'src', 'frameborder', 'allowfullscreen'],
        },
      }),
      width: ((oEmbed && oEmbed.type !== 'link') ? oEmbed.width : 0) || 0,
      height: ((oEmbed && oEmbed.type !== 'link') ? oEmbed.height : 0) || 0,
      image: oEmbed?.thumbnails?.[0].url || open_graph?.images?.[0].url || null,
      embed_url: '',
      blurhash: null,
    };
  } catch (e) {
    debug(`Failed to unfurl ${url}`);
    debug(e);
    return null;
  }
}

/** TTL cache for preview cards. */
const previewCardCache = new TTLCache<string, Promise<PreviewCard | null>>({
  ttl: Time.hours(12),
  max: 500,
});

/** Unfurl card from cache if available, otherwise fetch it. */
function unfurlCardCached(url: string, signal = AbortSignal.timeout(1000)): Promise<PreviewCard | null> {
  const cached = previewCardCache.get(url);
  if (cached !== undefined) {
    return cached;
  } else {
    const card = unfurlCard(url, signal);
    previewCardCache.set(url, card);
    return card;
  }
}

export { type PreviewCard, unfurlCardCached };

import TTLCache from '@isaacs/ttlcache';
import Debug from '@soapbox/stickynotes/debug';
import DOMPurify from 'isomorphic-dompurify';
import { unfurl } from 'unfurl.js';

import { PreviewCard } from '@/entities/PreviewCard.ts';
import { Time } from '@/utils/time.ts';
import { fetchWorker } from '@/workers/fetch.ts';

const debug = Debug('ditto:unfurl');

async function unfurlCard(url: string, signal: AbortSignal): Promise<PreviewCard | null> {
  debug(`Unfurling ${url}...`);
  try {
    const result = await unfurl(url, {
      fetch: (url) =>
        fetchWorker(url, {
          headers: { 'User-Agent': 'WhatsApp/2' },
          signal,
        }),
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

import { TTLCache, unfurl } from '@/deps.ts';
import { Time } from '@/utils/time.ts';
import { fetchWorker } from '@/workers/fetch.ts';

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
  console.log(`Unfurling ${url}...`);
  try {
    const result = await unfurl(url, {
      fetch: (url) => fetchWorker(url, { signal }),
    });

    return {
      type: result.oEmbed?.type || 'link',
      url: result.canonical_url || url,
      title: result.oEmbed?.title || result.title || '',
      description: result.open_graph.description || result.description || '',
      author_name: result.oEmbed?.author_name || '',
      author_url: result.oEmbed?.author_url || '',
      provider_name: result.oEmbed?.provider_name || '',
      provider_url: result.oEmbed?.provider_url || '',
      // @ts-expect-error `html` does in fact exist on oEmbed.
      html: sanitizeHtml(result.oEmbed?.html || '', {
        allowedTags: ['iframe'],
        allowedAttributes: {
          iframe: ['width', 'height', 'src', 'frameborder', 'allowfullscreen'],
        },
      }),
      width: result.oEmbed?.width || 0,
      height: result.oEmbed?.height || 0,
      image: result.oEmbed?.thumbnails?.[0].url || result.open_graph.images?.[0].url || null,
      embed_url: '',
      blurhash: null,
    };
  } catch (_e) {
    return null;
  }
}

/** TTL cache for preview cards. */
const previewCardCache = new TTLCache<string, Promise<PreviewCard | null>>({
  ttl: Time.hours(12),
  max: 500,
});

/** Unfurl card from cache if available, otherwise fetch it. */
function unfurlCardCached(url: string, timeout = Time.seconds(1)): Promise<PreviewCard | null> {
  const cached = previewCardCache.get(url);
  if (cached !== undefined) {
    return cached;
  } else {
    const card = unfurlCard(url, AbortSignal.timeout(timeout));
    previewCardCache.set(url, card);
    return card;
  }
}

export { type PreviewCard, unfurlCardCached };

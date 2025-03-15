import { userMiddleware } from '@ditto/mastoapi/middleware';
import { DittoRoute } from '@ditto/mastoapi/router';
import { NostrFilter, NRelay } from '@nostrify/nostrify';

const route = new DittoRoute();

interface MastodonCustomEmoji {
  shortcode: string;
  url: string;
  static_url: string;
  visible_in_picker: boolean;
  category?: string;
}

route.get('/', userMiddleware(), async (c) => {
  const { user } = c.var;

  const pubkey = await user.signer.getPublicKey();
  const emojis = await getCustomEmojis(pubkey, c.var);

  return c.json([...emojis.entries()].map(([shortcode, data]): MastodonCustomEmoji => {
    return {
      shortcode,
      url: data.url.toString(),
      static_url: data.url.toString(),
      visible_in_picker: true,
      category: data.category,
    };
  }));
});

interface GetCustomEmojisOpts {
  relay: NRelay;
  signal?: AbortSignal;
}

async function getCustomEmojis(
  pubkey: string,
  opts: GetCustomEmojisOpts,
): Promise<Map<string, { url: URL; category?: string }>> {
  const { relay, signal } = opts;

  const emojis = new Map<string, { url: URL; category?: string }>();

  const [emojiList] = await relay.query([{ kinds: [10030], authors: [pubkey] }], { signal });

  if (!emojiList) {
    return emojis;
  }

  const a = new Set<string>();

  for (const tag of emojiList.tags) {
    if (tag[0] === 'emoji') {
      const [, shortcode, url] = tag;

      if (!emojis.has(shortcode)) {
        try {
          emojis.set(shortcode, { url: new URL(url) });
        } catch {
          // continue
        }
      }
    }

    if (tag[0] === 'a') {
      a.add(tag[1]);
    }
  }

  const filters: NostrFilter[] = [];

  for (const addr of a) {
    const match = addr.match(/^30030:([0-9a-f]{64}):(.+)$/);

    if (match) {
      const [, pubkey, d] = match;
      filters.push({ kinds: [30030], authors: [pubkey], '#d': [d] });
    }
  }

  if (!filters.length) {
    return new Map();
  }

  for (const event of await relay.query(filters, { signal })) {
    const d = event.tags.find(([name]) => name === 'd')?.[1];

    for (const [t, shortcode, url] of event.tags) {
      if (t === 'emoji') {
        if (!emojis.has(shortcode)) {
          try {
            emojis.set(shortcode, { url: new URL(url), category: d });
          } catch {
            // continue
          }
        }
      }
    }
  }

  return emojis;
}

export default route;

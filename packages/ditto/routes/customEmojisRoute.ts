import { userMiddleware } from '@ditto/mastoapi/middleware';
import { DittoRoute } from '@ditto/mastoapi/router';
import { NostrFilter } from '@nostrify/nostrify';

const route = new DittoRoute();

interface MastodonCustomEmoji {
  shortcode: string;
  url: string;
  static_url: string;
  visible_in_picker: boolean;
  category?: string;
}

route.get('/', userMiddleware(), async (c) => {
  const { relay, user, signal } = c.var;

  const pubkey = await user.signer.getPublicKey();

  const [emojiList] = await relay.query([{ kinds: [10030], authors: [pubkey] }], { signal });

  if (!emojiList) {
    return c.json([]);
  }

  const a = new Set<string>();
  const emojis = new Map<string, URL>();

  for (const tag of emojiList.tags) {
    if (tag[0] === 'emoji') {
      const [, shortcode, url] = tag;

      if (!emojis.has(shortcode)) {
        try {
          emojis.set(shortcode, new URL(url));
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
    return c.json([]);
  }

  for (const event of await relay.query(filters, { signal })) {
    for (const [t, shortcode, url] of event.tags) {
      if (t === 'emoji') {
        if (!emojis.has(shortcode)) {
          try {
            emojis.set(shortcode, new URL(url));
          } catch {
            // continue
          }
        }
      }
    }
  }

  return c.json([...emojis.entries()].map(([shortcode, url]): MastodonCustomEmoji => {
    return {
      shortcode,
      url: url.toString(),
      static_url: url.toString(),
      visible_in_picker: true,
    };
  }));
});

export default route;

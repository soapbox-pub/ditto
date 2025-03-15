import { userMiddleware } from '@ditto/mastoapi/middleware';
import { DittoRoute } from '@ditto/mastoapi/router';

import { getCustomEmojis } from '@/utils/custom-emoji.ts';

const route = new DittoRoute();

interface MastodonCustomEmoji {
  shortcode: string;
  url: string;
  static_url: string;
  visible_in_picker: boolean;
  category?: string;
}

route.get('/', userMiddleware({ required: false }), async (c) => {
  const { user } = c.var;

  if (!user) {
    return c.json([]);
  }

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

export default route;

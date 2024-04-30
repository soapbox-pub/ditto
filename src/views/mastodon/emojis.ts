import { UnsignedEvent } from 'nostr-tools';

import { EmojiTag, emojiTagSchema } from '@/schemas/nostr.ts';
import { filteredArray } from '@/schema.ts';

function renderEmoji([_, shortcode, url]: EmojiTag) {
  return {
    shortcode,
    static_url: url,
    url,
  };
}

function renderEmojis({ tags }: UnsignedEvent) {
  return filteredArray(emojiTagSchema)
    .parse(tags)
    .map(renderEmoji);
}

export { renderEmojis };

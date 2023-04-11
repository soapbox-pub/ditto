import { z } from '@/deps.ts';

import { type Event } from '../event.ts';

const optionalString = z.string().optional().catch(undefined);

const metaContentSchema = z.object({
  name: optionalString,
  about: optionalString,
  picture: optionalString,
  banner: optionalString,
  nip05: optionalString,
  lud16: optionalString,
});

/** Author metadata from Event<0>. */
type MetaContent = z.infer<typeof metaContentSchema>;

/**
 * Get (and validate) data from a kind 0 event.
 * https://github.com/nostr-protocol/nips/blob/master/01.md
 */
function parseContent(event: Event<0>): MetaContent {
  try {
    const json = JSON.parse(event.content);
    return metaContentSchema.parse(json);
  } catch (_e) {
    return {};
  }
}

export { type MetaContent, metaContentSchema, parseContent };

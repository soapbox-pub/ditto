import type { NostrFilter, NRelay } from '@nostrify/nostrify';

interface GetCustomEmojisOpts {
  relay: NRelay;
  signal?: AbortSignal;
}

export async function getCustomEmojis(
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
    return emojis;
  }

  for (const event of await relay.query(filters, { signal })) {
    const d = event.tags.find(([name]) => name === 'd')?.[1];

    for (const [t, shortcode, url] of event.tags) {
      if (t === 'emoji' && /^\w+$/.test(shortcode) && !emojis.has(shortcode)) {
        try {
          emojis.set(shortcode, { url: new URL(url), category: d });
        } catch {
          // continue
        }
      }
    }
  }

  return emojis;
}

/** Determine if the input is a native or custom emoji, returning a structured object or throwing an error. */
export function parseEmojiInput(input: string):
  | { type: 'basic'; value: '+' | '-' }
  | { type: 'native'; native: string }
  | { type: 'custom'; shortcode: string }
  | undefined {
  if (input === '+' || input === '-') {
    return { type: 'basic', value: input };
  }

  if (/^\p{RGI_Emoji}$/v.test(input)) {
    return { type: 'native', native: input };
  }

  const match = input.match(/^:(\w+):$/);
  if (match) {
    const [, shortcode] = match;
    return { type: 'custom', shortcode };
  }
}

import type { NostrEvent } from '@nostrify/nostrify';

/**
 * Checks if a string is a NIP-30 custom emoji shortcode (`:shortcode:` format).
 */
export function isCustomEmoji(content: string): boolean {
  return /^:[a-zA-Z0-9_]+:$/.test(content);
}

/**
 * Extracts the custom emoji URL from a NostrEvent's tags for a given shortcode.
 * The shortcode should include the colons (e.g., `:soapbox:`).
 */
export function getCustomEmojiUrl(shortcode: string, tags: string[][]): string | undefined {
  const name = shortcode.slice(1, -1); // Remove surrounding colons
  const emojiTag = tags.find(([tagName, tagShortcode]) => tagName === 'emoji' && tagShortcode === name);
  return emojiTag?.[2];
}

/**
 * Builds a map of shortcode -> URL from an event's emoji tags.
 */
export function buildEmojiMap(tags: string[][]): Map<string, string> {
  const map = new Map<string, string>();
  for (const tag of tags) {
    if (tag[0] === 'emoji' && tag[1] && tag[2]) {
      map.set(tag[1], tag[2]);
    }
  }
  return map;
}

/**
 * Represents a resolved reaction emoji that can be rendered.
 * For custom emojis, includes the URL; for unicode, just the content string.
 */
export interface ResolvedEmoji {
  /** The display content — unicode emoji string or `:shortcode:` */
  content: string;
  /** For custom emojis, the image URL. Undefined for unicode emojis. */
  url?: string;
  /** For custom emojis, the shortcode name (without colons). */
  name?: string;
}

/**
 * Resolves a reaction emoji from a kind 7 event into a ResolvedEmoji.
 */
export function resolveReactionEmoji(event: NostrEvent): ResolvedEmoji {
  const content = event.content.trim();
  const emoji = (content === '+' || content === '') ? '👍' : content === '-' ? '👎' : content;

  if (isCustomEmoji(emoji)) {
    const url = getCustomEmojiUrl(emoji, event.tags);
    if (url) {
      return { content: emoji, url, name: emoji.slice(1, -1) };
    }
  }

  return { content: emoji };
}

import type { ReactNode } from 'react';
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

interface CustomEmojiImgProps {
  /** The shortcode name (without colons). */
  name: string;
  /** The image URL. */
  url: string;
  /** CSS class name for the img element. */
  className?: string;
}

/**
 * Renders a single custom emoji as an inline image.
 */
export function CustomEmojiImg({ name, url, className = 'inline h-[1.2em] w-[1.2em] align-text-bottom' }: CustomEmojiImgProps) {
  return (
    <img
      src={url}
      alt={`:${name}:`}
      title={`:${name}:`}
      className={className}
      loading="lazy"
      decoding="async"
    />
  );
}

interface ReactionEmojiProps {
  /** The reaction content (could be a unicode emoji, `:shortcode:`, `+`, or empty). */
  content: string;
  /** The tags from the kind 7 event, used to look up custom emoji URLs. */
  tags?: string[][];
  /** CSS class name for the wrapper span (used for unicode) or img (used for custom emoji). */
  className?: string;
}

/**
 * Renders a reaction emoji, handling both unicode and NIP-30 custom emojis.
 * 
 * For custom emojis (`:shortcode:` format), it looks up the URL from the event's
 * emoji tags and renders an inline image. For unicode emojis, it renders the text directly.
 */
export function ReactionEmoji({ content, tags, className }: ReactionEmojiProps) {
  // Normalize '+' and empty to thumbs up, '-' to thumbs down
  const emoji = (content === '+' || content === '') ? '👍' : content === '-' ? '👎' : content;

  // Check for custom emoji
  if (isCustomEmoji(emoji) && tags) {
    const url = getCustomEmojiUrl(emoji, tags);
    if (url) {
      const name = emoji.slice(1, -1);
      return <CustomEmojiImg name={name} url={url} className={className ?? 'inline h-[1.2em] w-[1.2em] align-text-bottom'} />;
    }
  }

  // Unicode emoji or fallback for unresolved custom emoji
  return <span className={className}>{emoji}</span>;
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

/**
 * Renders a ResolvedEmoji inline.
 */
export function RenderResolvedEmoji({ emoji, className }: { emoji: ResolvedEmoji; className?: string }) {
  if (emoji.url && emoji.name) {
    return <CustomEmojiImg name={emoji.name} url={emoji.url} className={className ?? 'inline h-[1.2em] w-[1.2em] align-text-bottom'} />;
  }
  return <span className={className}>{emoji.content}</span>;
}

/** Regex matching `:shortcode:` patterns in text. */
const SHORTCODE_REGEX = /:([a-zA-Z0-9_]+):/g;

/**
 * Replaces `:shortcode:` patterns in text with inline custom emoji images.
 * 
 * Takes a text string and an emoji map (shortcode -> URL), and returns an array
 * of React nodes where matched shortcodes are replaced with `<CustomEmojiImg>`.
 * If no emoji tags are present, returns the text as-is for zero overhead.
 * 
 * @param text - The text to emojify.
 * @param emojiMap - Map of shortcode names (without colons) to image URLs. 
 *                   Build with `buildEmojiMap(event.tags)`.
 * @param imgClassName - Optional CSS class for the custom emoji images.
 */
export function emojify(
  text: string,
  emojiMap: Map<string, string>,
  imgClassName?: string,
): ReactNode[] {
  if (emojiMap.size === 0) return [text];

  const result: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  // Reset lastIndex since the regex is global
  SHORTCODE_REGEX.lastIndex = 0;

  while ((match = SHORTCODE_REGEX.exec(text)) !== null) {
    const [fullMatch, shortcode] = match;
    const url = emojiMap.get(shortcode);

    if (!url) continue;

    // Add text before this match
    if (match.index > lastIndex) {
      result.push(text.substring(lastIndex, match.index));
    }

    result.push(
      <CustomEmojiImg
        key={`emoji-${match.index}`}
        name={shortcode}
        url={url}
        className={imgClassName}
      />,
    );

    lastIndex = match.index + fullMatch.length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    result.push(text.substring(lastIndex));
  }

  return result.length > 0 ? result : [text];
}

interface EmojifiedTextProps {
  /** The text to emojify. */
  children: string;
  /** The event tags to extract emoji definitions from. */
  tags: string[][];
  /** Optional CSS class for the custom emoji images. */
  imgClassName?: string;
}

/**
 * Renders text with NIP-30 custom emoji shortcodes replaced by inline images.
 * 
 * Usage:
 * ```tsx
 * <EmojifiedText tags={event.tags}>
 *   {metadata.name}
 * </EmojifiedText>
 * ```
 */
export function EmojifiedText({ children, tags, imgClassName }: EmojifiedTextProps) {
  const emojiMap = buildEmojiMap(tags);
  if (emojiMap.size === 0) return <>{children}</>;
  return <>{emojify(children, emojiMap, imgClassName)}</>;
}

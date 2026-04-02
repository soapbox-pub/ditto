import type { ReactNode } from 'react';

import { isCustomEmoji, getCustomEmojiUrl, buildEmojiMap, type ResolvedEmoji } from '@/lib/customEmoji';
import { cn } from '@/lib/utils';

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
export function CustomEmojiImg({ name, url, className = 'inline h-[1.2em] w-[1.2em] object-contain align-text-bottom' }: CustomEmojiImgProps) {
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
      return <CustomEmojiImg name={name} url={url} className={className ?? 'inline h-[1.2em] w-[1.2em] object-contain align-text-bottom'} />;
    }
  }

  // Malformed custom emoji (shortcode without emoji tag) — render nothing
  if (isCustomEmoji(emoji)) {
    return null;
  }

  // Unicode emoji
  return <span className={className}>{emoji}</span>;
}

/**
 * Renders a ResolvedEmoji inline.
 */
export function RenderResolvedEmoji({ emoji, className }: { emoji: ResolvedEmoji; className?: string }) {
  if (emoji.url && emoji.name) {
    return <CustomEmojiImg name={emoji.name} url={emoji.url} className={className ?? 'inline h-[1.2em] w-[1.2em] object-contain align-middle'} />;
  }
  return <span className={cn('inline-block leading-none', className)}>{emoji.content}</span>;
}

/** Regex matching `:shortcode:` patterns in text. */
const SHORTCODE_REGEX = /:([a-zA-Z0-9_-]+):/g;

/** Replaces `:shortcode:` patterns in text with inline custom emoji images. */
function emojify(
  text: string,
  emojiMap: Map<string, string>,
  imgClassName?: string,
): ReactNode[] {
  if (emojiMap.size === 0) return [text];

  const result: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  SHORTCODE_REGEX.lastIndex = 0;

  while ((match = SHORTCODE_REGEX.exec(text)) !== null) {
    const [fullMatch, shortcode] = match;
    const url = emojiMap.get(shortcode);

    if (!url) continue;

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

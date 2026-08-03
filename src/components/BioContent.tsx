import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import { buildEmojiMap } from '@/lib/customEmoji';
import { HASHTAG_PATTERN } from '@/lib/hashtag';
import { CustomEmojiImg } from '@/components/CustomEmoji';
import { NostrMention } from '@/components/NostrMention';

/** Regex matching `:shortcode:` patterns in text. */
const SHORTCODE_REGEX = /:([a-zA-Z0-9_-]+):/g;

/** A parsed token from bio content. */
type BioToken =
  | { type: 'text'; value: string }
  | { type: 'url'; url: string }
  | { type: 'hashtag'; tag: string; raw: string }
  | { type: 'mention'; pubkey: string };

/**
 * Tokenize bio text into plain text, URLs, hashtags, and profile mentions.
 * This is a lightweight version of the NoteContent tokenizer — it handles
 * URLs, hashtags, and npub/nprofile mentions (no event embeds, images, etc.).
 */
function tokenizeBio(text: string): BioToken[] {
  // Match: URLs (http/https) | npub/nprofile ids (with optional nostr:/@ prefix) | hashtags (#word)
  const regex = new RegExp(
    '(https?:\\/\\/[^\\s]+)'
    + '|(?:nostr:|@)?((?:npub1|nprofile1)[023456789acdefghjklmnpqrstuvwxyz]+)'
    + `|(${HASHTAG_PATTERN})`,
    'giu',
  );

  const result: BioToken[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    let [fullMatch] = match;
    const [, url, nostrId, hashtag] = match;
    const index = match.index;

    // Add text before this match
    if (index > lastIndex) {
      result.push({ type: 'text', value: text.substring(lastIndex, index) });
    }

    if (url) {
      // Strip common trailing punctuation that's likely not part of the URL
      const trailingPunctMatch = url.match(/^(.*?)([.,;:!?)\]]+)$/);
      let cleanUrl = url;
      if (trailingPunctMatch) {
        const [, urlWithoutPunct] = trailingPunctMatch;
        if (urlWithoutPunct && urlWithoutPunct.length > 10) {
          cleanUrl = urlWithoutPunct;
          fullMatch = urlWithoutPunct;
        }
      }
      result.push({ type: 'url', url: cleanUrl });
    } else if (nostrId) {
      try {
        const decoded = nip19.decode(nostrId.toLowerCase());
        if (decoded.type === 'npub') {
          result.push({ type: 'mention', pubkey: decoded.data });
        } else if (decoded.type === 'nprofile') {
          result.push({ type: 'mention', pubkey: decoded.data.pubkey });
        } else {
          result.push({ type: 'text', value: fullMatch });
        }
      } catch {
        // Malformed identifier → leave as plain text
        result.push({ type: 'text', value: fullMatch });
      }
    } else if (hashtag) {
      const tag = hashtag.slice(1);
      result.push({ type: 'hashtag', tag, raw: hashtag });
    }

    lastIndex = index + fullMatch.length;
  }

  // Add any remaining text
  if (lastIndex < text.length) {
    result.push({ type: 'text', value: text.substring(lastIndex) });
  }

  if (result.length === 0) {
    result.push({ type: 'text', value: text });
  }

  return result;
}

/**
 * Replaces `:shortcode:` patterns in text with inline custom emoji images.
 */
function emojify(
  text: string,
  emojiMap: Map<string, string>,
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
      />,
    );

    lastIndex = match.index + fullMatch.length;
  }

  if (lastIndex < text.length) {
    result.push(text.substring(lastIndex));
  }

  return result.length > 0 ? result : [text];
}

interface BioContentProps {
  /** The bio/about text to render. */
  children: string;
  /** Event tags (for NIP-30 custom emoji resolution). */
  tags?: string[][];
  /** Optional CSS class name. */
  className?: string;
}

/**
 * Renders bio/about text with linkified URLs, hashtags, and profile mentions,
 * plus NIP-30 custom emoji support.
 *
 * This is a lightweight alternative to NoteContent specifically for profile bios.
 * It handles URLs (as clickable links), hashtags (as internal links to /t/<tag>),
 * and npub/nprofile identifiers (as clickable @mentions with hover cards)
 * without the heavier embed/image logic of NoteContent.
 */
export function BioContent({ children, tags, className }: BioContentProps) {
  const emojiMap = useMemo(() => (tags ? buildEmojiMap(tags) : new Map<string, string>()), [tags]);
  const tokens = useMemo(() => tokenizeBio(children), [children]);

  return (
    <span dir="auto" className={className}>
      {tokens.map((token, i) => {
        switch (token.type) {
          case 'text':
            return <span key={i}>{emojify(token.value, emojiMap)}</span>;
          case 'url':
            return (
              <a
                key={i}
                href={token.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline break-all"
                onClick={(e) => e.stopPropagation()}
              >
                {token.url}
              </a>
            );
          case 'hashtag':
            return (
              <Link
                key={i}
                to={`/t/${token.tag}`}
                className="text-primary hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                {token.raw}
              </Link>
            );
          case 'mention':
            return <NostrMention key={i} pubkey={token.pubkey} />;
        }
      })}
    </span>
  );
}

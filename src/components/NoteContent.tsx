import { useMemo, useState, useCallback, type ReactNode } from 'react';
import { type NostrEvent } from '@nostrify/nostrify';
import { Link } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import { useAuthor } from '@/hooks/useAuthor';
import { genUserName } from '@/lib/genUserName';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { LinkEmbed } from '@/components/LinkEmbed';
import { EmbeddedNote } from '@/components/EmbeddedNote';
import { EmbeddedNaddr } from '@/components/EmbeddedNaddr';
import { Lightbox, ImageGallery } from '@/components/ImageGallery';
import { ProfileHoverCard } from '@/components/ProfileHoverCard';
import { EmojifiedText, CustomEmojiImg } from '@/components/CustomEmoji';
import { buildEmojiMap } from '@/lib/customEmoji';
import { useCustomEmojis } from '@/hooks/useCustomEmojis';
import { useBlossomFallback } from '@/hooks/useBlossomFallback';
import { COUNTRIES } from '@/lib/countries';
import { IMAGE_URL_REGEX, EMBED_MEDIA_URL_REGEX } from '@/lib/mediaUrls';
import { cn } from '@/lib/utils';
import type { AddrCoords } from '@/hooks/useEvent';

interface NoteContentProps {
  event: NostrEvent;
  className?: string;
  /** When true, renders URLs as inline links instead of link preview cards / embeds. */
  disableEmbeds?: boolean;
  /** When true, hides thumbnail images in link preview cards (useful when a cover image is already shown). */
  hideEmbedImages?: boolean;
}

/** Regex matching `:shortcode:` patterns in text. */
const SHORTCODE_REGEX = /:([a-zA-Z0-9_-]+):/g;

/**
 * Replaces `:shortcode:` patterns in text with inline custom emoji images.
 */
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

/** Bech32 charset used by NIP-19 identifiers. */
const BECH32_CHARS = '023456789acdefghjklmnpqrstuvwxyz';

/** Regex to extract an naddr1 identifier from a URL path. */
const NADDR_IN_URL_REGEX = new RegExp(`naddr1[${BECH32_CHARS}]{10,}`, 'i');

/** Try to extract naddr coordinates from a URL containing an naddr1 identifier. */
function extractNaddrFromUrl(url: string): AddrCoords | null {
  const match = url.match(NADDR_IN_URL_REGEX);
  if (!match) return null;
  try {
    const decoded = nip19.decode(match[0]);
    if (decoded.type === 'naddr') {
      return decoded.data as AddrCoords;
    }
  } catch {
    // invalid naddr
  }
  return null;
}

/** Regex matching flag emoji: pairs of Regional Indicator Symbol letters (U+1F1E6–U+1F1FF). */
const FLAG_EMOJI_REGEX = /([\u{1F1E6}-\u{1F1FF}]{2})/gu;

/**
 * Convert a flag emoji (pair of Regional Indicator Symbols) to an ISO 3166-1 alpha-2 code.
 * Returns the code if it maps to a known country, otherwise null.
 */
function flagToCountryCode(flag: string): string | null {
  const codePoints = [...flag];
  if (codePoints.length !== 2) return null;
  const a = codePoints[0].codePointAt(0)! - 0x1F1E6 + 65;
  const b = codePoints[1].codePointAt(0)! - 0x1F1E6 + 65;
  const code = String.fromCharCode(a) + String.fromCharCode(b);
  return COUNTRIES[code] ? code : null;
}

/**
 * Process an array of ReactNodes (from emojify), splitting any string nodes
 * to wrap flag emojis in <Link> elements pointing to /i/iso3166:<CODE>.
 */
function linkifyFlags(nodes: ReactNode[]): ReactNode[] {
  const result: ReactNode[] = [];
  let keyIdx = 0;

  for (const node of nodes) {
    if (typeof node !== 'string') {
      result.push(node);
      continue;
    }

    let lastIndex = 0;
    FLAG_EMOJI_REGEX.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = FLAG_EMOJI_REGEX.exec(node)) !== null) {
      const flag = match[1];
      const code = flagToCountryCode(flag);
      if (!code) continue;

      if (match.index > lastIndex) {
        result.push(node.substring(lastIndex, match.index));
      }

      result.push(
        <Link
          key={`flag-${keyIdx++}`}
          to={`/i/iso3166:${code}`}
          className="hover:opacity-70 transition-opacity"
          onClick={(e) => e.stopPropagation()}
        >
          {flag}
        </Link>,
      );

      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < node.length) {
      result.push(node.substring(lastIndex));
    } else if (lastIndex === 0) {
      result.push(node);
    }
  }

  return result;
}

/** A parsed token from note content. */
type ContentToken =
  | { type: 'text'; value: string }
  | { type: 'image-embed'; url: string }
  | { type: 'image-gallery'; urls: string[] }
  | { type: 'link-embed'; url: string }
  | { type: 'inline-link'; url: string }
  | { type: 'mention'; pubkey: string }
  | { type: 'nevent-embed'; eventId: string; relays?: string[]; author?: string }
  | { type: 'naddr-embed'; addr: AddrCoords; url?: string }
  | { type: 'nostr-link'; id: string; raw: string }
  | { type: 'hashtag'; tag: string; raw: string }
  | { type: 'relay-link'; url: string };

/**
 * Regex segment matching a single visual emoji unit, including:
 * - ZWJ sequences (e.g. 👨‍👩‍👧‍👦, 👩‍💻)
 * - Skin tone / hair style modifiers (e.g. 👋🏽)
 * - Flag sequences (Regional Indicator pairs, e.g. 🇺🇸)
 * - Keycap sequences (e.g. 1️⃣)
 * - Tag sequences (e.g. 🏴󠁧󠁢󠁷󠁬󠁳󠁿)
 * - Basic presentation emojis (with or without VS16)
 */
const EMOJI_UNIT = [
  // ZWJ sequences: emoji (+ optional modifier) joined by ZWJ, repeated
  '(?:' +
    '(?:\\p{Emoji_Presentation}|\\p{Emoji}\\uFE0F)' +     // base emoji
    '[\\u{1F3FB}-\\u{1F3FF}]?' +                           // optional skin tone
    '(?:\\u200D(?:\\p{Emoji_Presentation}|\\p{Emoji}\\uFE0F)[\\u{1F3FB}-\\u{1F3FF}]?)+' + // ZWJ + next
  ')',
  // Flag sequences (two Regional Indicator symbols)
  '(?:[\\u{1F1E6}-\\u{1F1FF}]{2})',
  // Keycap sequences: digit/# /* + VS16 + combining enclosing keycap
  '(?:[0-9#*]\\uFE0F\\u20E3)',
  // Tag sequences (subdivision flags): 🏴 + tag chars + cancel tag
  '(?:\\u{1F3F4}[\\u{E0020}-\\u{E007E}]+\\u{E007F})',
  // Single emoji with optional skin tone modifier
  '(?:(?:\\p{Emoji_Presentation}|\\p{Emoji}\\uFE0F)[\\u{1F3FB}-\\u{1F3FF}]?)',
].join('|');

/** NIP-30 custom emoji shortcode pattern. */
const CUSTOM_EMOJI_SHORTCODE = ':([a-zA-Z0-9_-]+):';

/** Regex matching a string of only NIP-30 custom emoji shortcodes and/or unicode emojis (with optional whitespace). Max 10 visual emojis. */
const EMOJI_OR_CUSTOM_ONLY_REGEX = new RegExp(
  `^\\s*(?:(?:${CUSTOM_EMOJI_SHORTCODE}|${EMOJI_UNIT})\\s*){1,10}$`,
  'u',
);

/** Check if a string contains only unicode emojis and/or NIP-30 custom emoji shortcodes (and whitespace). */
function isOnlyEmojisOrCustom(text: string, emojiMap: Map<string, string>): boolean {
  if (!EMOJI_OR_CUSTOM_ONLY_REGEX.test(text)) return false;
  // Verify all shortcodes in the text actually resolve to a custom emoji
  const shortcodeMatches = text.matchAll(/:([a-zA-Z0-9_-]+):/g);
  for (const m of shortcodeMatches) {
    if (!emojiMap.has(m[1])) return false;
  }
  return true;
}


/** Parses content of text note events so that URLs and hashtags are linkified. */
export function NoteContent({
  event,
  className,
  disableEmbeds = false,
  hideEmbedImages = false,
}: NoteContentProps) {
  const tokens = useMemo(() => {
    const text = event.content;
    // Match: URLs | nostr:-prefixed NIP-19 ids | @-prefixed or bare NIP-19 ids | hashtags
    // NIP-19 ids can appear anywhere (with optional @ prefix that gets consumed)
    const regex = /((?:https?|wss?):\/\/[^\s]+)|nostr:(npub1|note1|nprofile1|nevent1|naddr1)([023456789acdefghjklmnpqrstuvwxyz]+)|@?(npub1|note1|nprofile1|nevent1|naddr1)([023456789acdefghjklmnpqrstuvwxyz]+)|(#\w+)/g;

    const result: ContentToken[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let hadMatches = false;

    while ((match = regex.exec(text)) !== null) {
      let [fullMatch, url] = match;
      const hashtag = match[6];
      const { 2: nostrPrefix, 3: nostrData, 4: barePrefix, 5: bareData } = match;
      const index = match.index;
      hadMatches = true;

      // Add text before this match
      if (index > lastIndex) {
        result.push({ type: 'text', value: text.substring(lastIndex, index) });
      }

      if (url) {
        // Strip common trailing punctuation that's likely not part of the URL
        // This handles cases like "(https://example.com)" or "Check this: https://example.com."
        const trailingPunctMatch = url.match(/^(.*?)([.,;:!?)\]]+)$/);
        if (trailingPunctMatch) {
          const [, urlWithoutPunct] = trailingPunctMatch;
          // Only strip the punctuation if the URL without it is still valid
          if (urlWithoutPunct && urlWithoutPunct.length > 10) {
            url = urlWithoutPunct;
            fullMatch = urlWithoutPunct;
            // The punctuation will be part of the next text token
          }
        }

        // WebSocket relay URLs → link to internal relay page
        if (/^wss?:\/\//i.test(url)) {
          result.push({ type: 'relay-link', url });
          lastIndex = index + fullMatch.length;
          continue;
        }

        // Image URLs → render inline at their position in the text
        if (IMAGE_URL_REGEX.test(url)) {
          if (result.length > 0) {
            const prev = result[result.length - 1];
            if (prev.type === 'text') {
              prev.value = prev.value.replace(/\s+$/, '');
            }
          }
          result.push({ type: 'image-embed', url });
          lastIndex = index + fullMatch.length;
          // Strip leading whitespace that follows the image URL
          const remaining = text.substring(lastIndex);
          const leadingWs = remaining.match(/^\s+/);
          if (leadingWs) {
            lastIndex += leadingWs[0].length;
          }
          continue;
        }

        // Skip non-image media URLs — rendered as embedded media by the parent.
        if (EMBED_MEDIA_URL_REGEX.test(url)) {
          if (result.length > 0) {
            const prev = result[result.length - 1];
            if (prev.type === 'text') {
              prev.value = prev.value.replace(/\s+$/, '');
            }
          }
          lastIndex = index + fullMatch.length;
          // Also strip leading whitespace that follows the skipped URL
          const remaining = text.substring(lastIndex);
          const leadingWs = remaining.match(/^\s+/);
          if (leadingWs) {
            lastIndex += leadingWs[0].length;
          }
          continue;
        }

        // Determine if this URL ends a line (not followed by more text).
        // A URL gets a preview card when nothing meaningful follows it on
        // the same line (i.e., it ends the line or the content).
        const afterUrl = text.substring(index + fullMatch.length);
        const nextNewline = afterUrl.indexOf('\n');
        const lineSuffix = nextNewline === -1 ? afterUrl : afterUrl.substring(0, nextNewline);
        const isEndOfLine = lineSuffix.trim() === '';

        // Check if the URL contains an naddr1 identifier → embed as Nostr event + preserve link
        const naddrFromUrl = extractNaddrFromUrl(url);
        if (naddrFromUrl) {
          result.push({ type: 'naddr-embed', addr: naddrFromUrl, url });
        } else if (isEndOfLine) {
          // Standalone URL at end of line → rich embed (YouTube, Tweet, or link preview)
          result.push({ type: 'link-embed', url });
        } else {
          // Inline URL mid-sentence → plain clickable link
          result.push({ type: 'inline-link', url });
        }
      } else if ((nostrPrefix && nostrData) || (barePrefix && bareData)) {
        // Handle both nostr:-prefixed and bare NIP-19 identifiers
        const prefix = nostrPrefix || barePrefix;
        const data = nostrData || bareData;
        try {
          const nostrId = `${prefix}${data}`;
          const decoded = nip19.decode(nostrId);

          if (decoded.type === 'npub') {
            result.push({ type: 'mention', pubkey: decoded.data });
          } else if (decoded.type === 'nprofile') {
            result.push({ type: 'mention', pubkey: decoded.data.pubkey });
          } else if (decoded.type === 'note') {
            result.push({ type: 'nevent-embed', eventId: decoded.data as string });
          } else if (decoded.type === 'nevent') {
            result.push({
              type: 'nevent-embed',
              eventId: decoded.data.id,
              relays: decoded.data.relays,
              author: decoded.data.author,
            });
          } else if (decoded.type === 'naddr') {
            result.push({ type: 'naddr-embed', addr: decoded.data as AddrCoords });
          } else {
            result.push({ type: 'nostr-link', id: nostrId, raw: fullMatch });
          }
        } catch {
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

    if (result.length === 0 && !hadMatches) {
      result.push({ type: 'text', value: text });
    }

    // Collapse excessive whitespace around block-level tokens (link-preview, youtube-embed)
    // Preserve formatting but prevent too much stacking with the card's own spacing.
    for (let i = 0; i < result.length; i++) {
      const token = result[i];
      const isBlock = token.type === 'image-embed' || token.type === 'link-embed' || token.type === 'nevent-embed'
        || (token.type === 'naddr-embed' && !token.url);

      if (isBlock) {
        // Strip all trailing whitespace from the preceding text token.
        // The block's own margin (my-2.5) handles spacing, so preserved
        // newlines just add redundant blank lines under whitespace-pre-wrap.
        if (i > 0) {
          const prev = result[i - 1];
          if (prev.type === 'text') {
            prev.value = prev.value.replace(/\s+$/, '');
          }
        }
        // Strip all leading whitespace from the following text token.
        if (i < result.length - 1) {
          const next = result[i + 1];
          if (next.type === 'text') {
            next.value = next.value.replace(/^\s+/, '');
          }
        }
      }
    }

    // Trim leading/trailing whitespace from edge text tokens
    if (result.length > 0) {
      const first = result[0];
      if (first.type === 'text') {
        first.value = first.value.replace(/^\s+/, '');
      }
      const last = result[result.length - 1];
      if (last.type === 'text') {
        last.value = last.value.replace(/\s+$/, '');
      }
    }

    // Filter out empty text tokens
    return result.filter((t) => !(t.type === 'text' && t.value === ''));
  }, [event]);

  // Build emoji map for NIP-30 custom emoji rendering.
  // Merge the event's own emoji tags with the viewer's custom emoji collection
  // so shortcodes render even when the published event omitted the tag.
  const { emojis: viewerEmojis } = useCustomEmojis();
  const emojiMap = useMemo(() => {
    const map = buildEmojiMap(event.tags);
    // Viewer's collection is a fallback — event tags take priority
    for (const e of viewerEmojis) {
      if (!map.has(e.shortcode)) {
        map.set(e.shortcode, e.url);
      }
    }
    return map;
  }, [event.tags, viewerEmojis]);

  // Parse imeta tags for dim/blurhash to pass to ImageGallery
  const imetaMap = useMemo(() => {
    const map = new Map<string, { dim?: string; blurhash?: string }>();
    for (const tag of event.tags) {
      if (tag[0] !== 'imeta') continue;
      const parts: Record<string, string> = {};
      for (let i = 1; i < tag.length; i++) {
        const p = tag[i];
        const sp = p.indexOf(' ');
        if (sp !== -1) parts[p.slice(0, sp)] = p.slice(sp + 1);
      }
      if (parts.url) map.set(parts.url, { dim: parts.dim, blurhash: parts.blurhash });
    }
    return map;
  }, [event.tags]);

  // Group consecutive image-embed tokens (≥2) into image-gallery tokens
  const groupedTokens = useMemo(() => {
    const result: ContentToken[] = [];
    let i = 0;
    while (i < tokens.length) {
      const token = tokens[i];
      if (token.type === 'image-embed') {
        // Collect this and any immediately following image-embed tokens
        const run: string[] = [token.url];
        let j = i + 1;
        while (j < tokens.length && tokens[j].type === 'image-embed') {
          run.push((tokens[j] as { type: 'image-embed'; url: string }).url);
          j++;
        }
        if (run.length >= 2) {
          result.push({ type: 'image-gallery', urls: run });
        } else {
          result.push(token);
        }
        i = j;
      } else {
        result.push(token);
        i++;
      }
    }
    return result;
  }, [tokens]);

  // Collect all inline image URLs (in order) for the shared lightbox
  const allImages = useMemo(
    () => groupedTokens.flatMap((t) => {
      if (t.type === 'image-embed') return [t.url];
      if (t.type === 'image-gallery') return t.urls;
      return [];
    }),
    [groupedTokens],
  );

  // Shared lightbox state for inline images
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const closeLightbox = useCallback(() => setLightboxIndex(null), []);
  const goNext = useCallback(() => setLightboxIndex((p) => (p !== null ? (p + 1) % allImages.length : null)), [allImages.length]);
  const goPrev = useCallback(() => setLightboxIndex((p) => (p !== null ? (p - 1 + allImages.length) % allImages.length : null)), [allImages.length]);

  // Check if content is only emojis — unicode and/or NIP-30 custom emojis (single text token)
  const isEmojiOnly = groupedTokens.length === 1 && groupedTokens[0].type === 'text' && isOnlyEmojisOrCustom(groupedTokens[0].value, emojiMap);

  // Build a map from grouped token index → starting image list index for lightbox positioning
  const tokenImageIndex = useMemo(() => {
    const map = new Map<number, number>();
    let imgCount = 0;
    groupedTokens.forEach((t, i) => {
      if (t.type === 'image-embed') {
        map.set(i, imgCount++);
      } else if (t.type === 'image-gallery') {
        map.set(i, imgCount);
        imgCount += t.urls.length;
      }
    });
    return map;
  }, [groupedTokens]);

  return (
    <div className={cn('whitespace-pre-wrap break-words overflow-hidden', className, isEmojiOnly && 'text-5xl leading-tight')}>
      {groupedTokens.map((token, i) => {
        switch (token.type) {
          case 'text':
            return <span key={i}>{linkifyFlags(emojify(token.value, emojiMap, isEmojiOnly ? 'inline h-12 w-12 align-text-bottom' : undefined))}</span>;
          case 'image-embed': {
            if (disableEmbeds) {
              // In preview contexts (e.g. triple-dot menu), replace image URLs
              // with a newline so text flow is preserved without showing raw URLs.
              return <span key={i}>{'\n'}</span>;
            }
            const imgIndex = tokenImageIndex.get(i) ?? 0;
            return (
              <InlineImage
                key={i}
                url={token.url}
                onClick={(e) => { e.stopPropagation(); setLightboxIndex(imgIndex); }}
              />
            );
          }
          case 'image-gallery': {
            if (disableEmbeds) {
              return <span key={i}>{token.urls.map(() => '\n').join('')}</span>;
            }
            const galleryStartIndex = tokenImageIndex.get(i) ?? 0;
            const galleryLightboxIndex =
              lightboxIndex !== null &&
              lightboxIndex >= galleryStartIndex &&
              lightboxIndex < galleryStartIndex + token.urls.length
                ? lightboxIndex - galleryStartIndex
                : null;
            return (
              <ImageGallery
                key={i}
                images={token.urls}
                maxVisible={4}
                maxGridHeight="480px"
                imetaMap={imetaMap}
                lightboxIndex={galleryLightboxIndex}
                onLightboxOpen={(idx) => { setLightboxIndex(galleryStartIndex + idx); }}
                onLightboxClose={closeLightbox}
              />
            );
          }
          case 'link-embed':
            if (disableEmbeds) {
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
            }
            return <LinkEmbed key={i} url={token.url} className="my-2.5" hideImage={hideEmbedImages} />;
          case 'inline-link':
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
          case 'nevent-embed':
            return <EmbeddedNote key={i} eventId={token.eventId} relays={token.relays} authorHint={token.author} className="my-2.5" />;
          case 'naddr-embed':
            return (
              <span key={i}>
                {token.url && (
                  <a
                    href={token.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline break-all"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {token.url}
                  </a>
                )}
                <EmbeddedNaddr addr={token.addr} className="my-2.5" />
              </span>
            );
          case 'mention':
            return <NostrMention key={i} pubkey={token.pubkey} />;
          case 'nostr-link':
            return (
              <Link
                key={i}
                to={`/${token.id}`}
                className="text-primary hover:underline break-all"
                onClick={(e) => e.stopPropagation()}
              >
                {token.raw}
              </Link>
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
          case 'relay-link':
            return (
              <Link
                key={i}
                to={`/r/${encodeURIComponent(token.url)}`}
                className="text-primary hover:underline break-all"
                onClick={(e) => e.stopPropagation()}
              >
                {token.url}
              </Link>
            );
        }
      })}

      {/* Shared lightbox for standalone inline images (not gallery groups) */}
      {lightboxIndex !== null && !groupedTokens.some(
        (t, i) =>
          t.type === 'image-gallery' &&
          lightboxIndex >= (tokenImageIndex.get(i) ?? 0) &&
          lightboxIndex < (tokenImageIndex.get(i) ?? 0) + t.urls.length,
      ) && (
        <Lightbox
          images={allImages}
          currentIndex={lightboxIndex}
          onClose={closeLightbox}
          onNext={goNext}
          onPrev={goPrev}
        />
      )}
    </div>
  );
}

/** Inline image thumbnail that opens the shared lightbox on click. */
function InlineImage({ url, onClick }: { url: string; onClick: (e: React.MouseEvent) => void }) {
  const { src, onError } = useBlossomFallback(url);

  return (
    <button
      type="button"
      className="block my-2 rounded-lg overflow-hidden w-full cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      onClick={onClick}
    >
      <img
        src={src}
        alt=""
        className="block w-full h-auto rounded-lg hover:opacity-90 transition-opacity"
        loading="lazy"
        onError={onError}
      />
    </button>
  );
}

function NostrMention({ pubkey }: { pubkey: string }) {
  const author = useAuthor(pubkey);
  const hasRealName = !!author.data?.metadata?.name;
  const displayName = author.data?.metadata?.name ?? genUserName(pubkey);
  const profileUrl = useProfileUrl(pubkey, author.data?.metadata);

  return (
    <ProfileHoverCard pubkey={pubkey} asChild>
      <Link
        to={profileUrl}
        className={cn(
          'font-medium hover:underline',
          hasRealName
            ? 'text-primary'
            : 'text-muted-foreground hover:text-foreground',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        @{author.data?.event ? (
          <EmojifiedText tags={author.data.event.tags}>{displayName}</EmojifiedText>
        ) : displayName}
      </Link>
    </ProfileHoverCard>
  );
}

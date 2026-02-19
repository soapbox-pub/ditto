import { useMemo } from 'react';
import { type NostrEvent } from '@nostrify/nostrify';
import { Link } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import { useAuthor } from '@/hooks/useAuthor';
import { genUserName } from '@/lib/genUserName';
import { getProfileUrl } from '@/lib/profileUrl';
import { LinkPreview } from '@/components/LinkPreview';
import { EmbeddedNote } from '@/components/EmbeddedNote';
import { EmbeddedNaddr } from '@/components/EmbeddedNaddr';
import { YouTubeEmbed } from '@/components/YouTubeEmbed';
import { ProfileHoverCard } from '@/components/ProfileHoverCard';
import { cn } from '@/lib/utils';
import type { AddrCoords } from '@/hooks/useEvent';

interface NoteContentProps {
  event: NostrEvent;
  className?: string;
}

/** Regex to detect media file URLs (images, video, audio, etc.) that are rendered as embeds. */
const MEDIA_URL_REGEX = /https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp|svg|mp4|webm|mov|mp3|ogg|wav|pdf)(\?[^\s]*)?/i;

/** Extract a YouTube video ID from a URL, or null if not a YouTube link. */
function extractYouTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    // youtube.com/watch?v=ID
    if ((u.hostname === 'www.youtube.com' || u.hostname === 'youtube.com' || u.hostname === 'm.youtube.com') && u.pathname === '/watch') {
      return u.searchParams.get('v');
    }
    // youtube.com/embed/ID
    if ((u.hostname === 'www.youtube.com' || u.hostname === 'youtube.com') && u.pathname.startsWith('/embed/')) {
      return u.pathname.split('/')[2] || null;
    }
    // youtube.com/shorts/ID
    if ((u.hostname === 'www.youtube.com' || u.hostname === 'youtube.com') && u.pathname.startsWith('/shorts/')) {
      return u.pathname.split('/')[2] || null;
    }
    // youtu.be/ID
    if (u.hostname === 'youtu.be') {
      return u.pathname.slice(1) || null;
    }
  } catch {
    // not a valid URL
  }
  return null;
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

/** A parsed token from note content. */
type ContentToken =
  | { type: 'text'; value: string }
  | { type: 'link-preview'; url: string }
  | { type: 'youtube-embed'; videoId: string }
  | { type: 'mention'; pubkey: string }
  | { type: 'nevent-embed'; eventId: string }
  | { type: 'naddr-embed'; addr: AddrCoords; url?: string }
  | { type: 'nostr-link'; id: string; raw: string }
  | { type: 'hashtag'; tag: string; raw: string };

/** Check if a string contains only emojis (and whitespace). */
function isOnlyEmojis(text: string): boolean {
  // Remove whitespace
  const trimmed = text.replace(/\s/g, '');
  if (trimmed.length === 0) return false;
  
  // Emoji regex - matches emoji characters including skin tone modifiers and ZWJ sequences
  // This is a simplified version - for production you might want a more comprehensive regex
  const emojiRegex = /^(\p{Emoji_Presentation}|\p{Emoji}\uFE0F)+$/u;
  
  return emojiRegex.test(trimmed) && trimmed.length <= 12; // Max 12 emoji chars for enlarged display
}

/** Parses content of text note events so that URLs and hashtags are linkified. */
export function NoteContent({
  event,
  className,
}: NoteContentProps) {
  const tokens = useMemo(() => {
    const text = event.content;
    // Match: URLs | nostr:-prefixed NIP-19 ids | @-prefixed or bare NIP-19 ids | hashtags
    // NIP-19 ids can appear anywhere (with optional @ prefix that gets consumed)
    const regex = /(https?:\/\/[^\s]+)|nostr:(npub1|note1|nprofile1|nevent1|naddr1)([023456789acdefghjklmnpqrstuvwxyz]+)|@?(npub1|note1|nprofile1|nevent1|naddr1)([023456789acdefghjklmnpqrstuvwxyz]+)|(#\w+)/g;

    const result: ContentToken[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let hadMatches = false;

    while ((match = regex.exec(text)) !== null) {
      let [fullMatch, url, nostrPrefix, nostrData, barePrefix, bareData, hashtag] = match;
      let index = match.index;
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
          const [, urlWithoutPunct, punctuation] = trailingPunctMatch;
          // Only strip the punctuation if the URL without it is still valid
          if (urlWithoutPunct && urlWithoutPunct.length > 10) {
            url = urlWithoutPunct;
            fullMatch = urlWithoutPunct;
            // The punctuation will be part of the next text token
          }
        }
        // Skip media URLs — rendered as embedded previews by the parent
        if (MEDIA_URL_REGEX.test(url)) {
          lastIndex = index + fullMatch.length;
          continue;
        }

        // Check if the URL contains an naddr1 identifier → embed as Nostr event + preserve link
        const naddrFromUrl = extractNaddrFromUrl(url);
        if (naddrFromUrl) {
          result.push({ type: 'naddr-embed', addr: naddrFromUrl, url });
        } else {
          // YouTube → playable embed
          const ytId = extractYouTubeId(url);
          if (ytId) {
            result.push({ type: 'youtube-embed', videoId: ytId });
          } else {
            // Other non-media URL → link preview card
            result.push({ type: 'link-preview', url });
          }
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
            result.push({ type: 'nevent-embed', eventId: (decoded.data as { id: string }).id });
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
      const isBlock = token.type === 'link-preview' || token.type === 'youtube-embed' || token.type === 'nevent-embed'
        || token.type === 'naddr-embed';

      if (isBlock) {
        // Trim trailing whitespace from the preceding text token (before the block)
        if (i > 0) {
          const prev = result[i - 1];
          if (prev.type === 'text') {
            // Collapse multiple trailing newlines to max 2, trim trailing spaces
            prev.value = prev.value.replace(/[ \t]+$/gm, '').replace(/\n{3,}$/, '\n\n');
          }
        }
        // After the block, collapse multiple leading newlines but preserve one if present
        if (i < result.length - 1) {
          const next = result[i + 1];
          if (next.type === 'text') {
            // Collapse multiple leading newlines to max 2, trim leading spaces on each line
            next.value = next.value.replace(/^[ \t]+/gm, '').replace(/^\n{3,}/, '\n\n');
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

  // Check if content is only emojis (single text token with only emojis)
  const isEmojiOnly = tokens.length === 1 && tokens[0].type === 'text' && isOnlyEmojis(tokens[0].value);

  return (
    <div className={cn('whitespace-pre-wrap break-words', isEmojiOnly && 'text-5xl leading-tight', className)}>
      {tokens.map((token, i) => {
        switch (token.type) {
          case 'text':
            return <span key={i}>{token.value}</span>;
          case 'link-preview':
            return <LinkPreview key={i} url={token.url} className="my-2.5" />;
          case 'youtube-embed':
            return <YouTubeEmbed key={i} videoId={token.videoId} className="my-2.5" />;
          case 'nevent-embed':
            return <EmbeddedNote key={i} eventId={token.eventId} className="my-2.5" />;
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
        }
      })}
    </div>
  );
}

function NostrMention({ pubkey }: { pubkey: string }) {
  const author = useAuthor(pubkey);
  const hasRealName = !!author.data?.metadata?.name;
  const displayName = author.data?.metadata?.name ?? genUserName(pubkey);
  const profileUrl = getProfileUrl(pubkey, author.data?.metadata);

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
        @{displayName}
      </Link>
    </ProfileHoverCard>
  );
}

import { useMemo } from 'react';
import { type NostrEvent } from '@nostrify/nostrify';
import { Link } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import { useAuthor } from '@/hooks/useAuthor';
import { genUserName } from '@/lib/genUserName';
import { LinkPreview } from '@/components/LinkPreview';
import { EmbeddedNote } from '@/components/EmbeddedNote';
import { YouTubeEmbed } from '@/components/YouTubeEmbed';
import { cn } from '@/lib/utils';

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

/** A parsed token from note content. */
type ContentToken =
  | { type: 'text'; value: string }
  | { type: 'link-preview'; url: string }
  | { type: 'youtube-embed'; videoId: string }
  | { type: 'mention'; pubkey: string }
  | { type: 'nevent-embed'; eventId: string }
  | { type: 'nostr-link'; id: string; raw: string }
  | { type: 'hashtag'; tag: string; raw: string };

/** Parses content of text note events so that URLs and hashtags are linkified. */
export function NoteContent({
  event,
  className,
}: NoteContentProps) {
  const tokens = useMemo(() => {
    const text = event.content;
    const regex = /(https?:\/\/[^\s]+)|nostr:(npub1|note1|nprofile1|nevent1)([023456789acdefghjklmnpqrstuvwxyz]+)|(#\w+)/g;

    const result: ContentToken[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      const [fullMatch, url, nostrPrefix, nostrData, hashtag] = match;
      const index = match.index;

      // Add text before this match
      if (index > lastIndex) {
        result.push({ type: 'text', value: text.substring(lastIndex, index) });
      }

      if (url) {
        // Skip media URLs — rendered as embedded previews by the parent
        if (MEDIA_URL_REGEX.test(url)) {
          lastIndex = index + fullMatch.length;
          continue;
        }

        // YouTube → playable embed
        const ytId = extractYouTubeId(url);
        if (ytId) {
          result.push({ type: 'youtube-embed', videoId: ytId });
        } else {
          // Other non-media URL → link preview card
          result.push({ type: 'link-preview', url });
        }
      } else if (nostrPrefix && nostrData) {
        try {
          const nostrId = `${nostrPrefix}${nostrData}`;
          const decoded = nip19.decode(nostrId);

          if (decoded.type === 'npub') {
            result.push({ type: 'mention', pubkey: decoded.data });
          } else if (decoded.type === 'nprofile') {
            result.push({ type: 'mention', pubkey: decoded.data.pubkey });
          } else if (decoded.type === 'note') {
            result.push({ type: 'nevent-embed', eventId: decoded.data as string });
          } else if (decoded.type === 'nevent') {
            result.push({ type: 'nevent-embed', eventId: (decoded.data as { id: string }).id });
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

    if (result.length === 0) {
      result.push({ type: 'text', value: text });
    }

    // Collapse whitespace around block-level tokens (link-preview, youtube-embed)
    // so that newlines surrounding a URL don't stack with the card's own spacing.
    for (let i = 0; i < result.length; i++) {
      const token = result[i];
      if (token.type === 'link-preview' || token.type === 'youtube-embed' || token.type === 'nevent-embed') {
        // Trim trailing whitespace from the preceding text token
        if (i > 0) {
          const prev = result[i - 1];
          if (prev.type === 'text') {
            prev.value = prev.value.replace(/\s+$/, '');
          }
        }
        // Trim leading whitespace from the following text token
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

  return (
    <div className={cn('whitespace-pre-wrap break-words', className)}>
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
          case 'mention':
            return <NostrMention key={i} pubkey={token.pubkey} />;
          case 'nostr-link':
            return (
              <Link
                key={i}
                to={`/${token.id}`}
                className="text-primary hover:underline break-all"
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
  const npub = nip19.npubEncode(pubkey);
  const hasRealName = !!author.data?.metadata?.name;
  const displayName = author.data?.metadata?.name ?? genUserName(pubkey);

  return (
    <Link
      to={`/${npub}`}
      className={cn(
        'font-medium hover:underline',
        hasRealName
          ? 'text-primary'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      @{displayName}
    </Link>
  );
}

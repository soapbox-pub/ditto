import { useMemo } from 'react';
import { type NostrEvent } from '@nostrify/nostrify';
import { Link } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import { useAuthor } from '@/hooks/useAuthor';
import { genUserName } from '@/lib/genUserName';
import { LinkPreview } from '@/components/LinkPreview';
import { cn } from '@/lib/utils';

interface NoteContentProps {
  event: NostrEvent;
  className?: string;
}

/** Regex to detect media file URLs (images, video, audio, etc.) that are rendered as embeds. */
const MEDIA_URL_REGEX = /https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp|svg|mp4|webm|mov|mp3|ogg|wav|pdf)(\?[^\s]*)?/i;

/** A parsed token from note content. */
type ContentToken =
  | { type: 'text'; value: string }
  | { type: 'link-preview'; url: string }
  | { type: 'mention'; pubkey: string }
  | { type: 'nostr-link'; id: string; raw: string }
  | { type: 'hashtag'; tag: string; raw: string };

/** Parses content of text note events so that URLs and hashtags are linkified. */
export function NoteContent({
  event,
  className,
}: NoteContentProps) {
  // Parse content into tokens (pure data, no hooks)
  const tokens = useMemo(() => {
    const text = event.content;

    // Regex to find URLs, Nostr references, and hashtags
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
        // Skip media URLs — they are rendered as embedded previews by the parent
        if (MEDIA_URL_REGEX.test(url)) {
          lastIndex = index + fullMatch.length;
          continue;
        }
        // Non-media URL → render as link preview card in-place
        result.push({ type: 'link-preview', url });
      } else if (nostrPrefix && nostrData) {
        // Handle Nostr references
        try {
          const nostrId = `${nostrPrefix}${nostrData}`;
          const decoded = nip19.decode(nostrId);

          if (decoded.type === 'npub') {
            result.push({ type: 'mention', pubkey: decoded.data });
          } else if (decoded.type === 'nprofile') {
            result.push({ type: 'mention', pubkey: decoded.data.pubkey });
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

    // If no special content was found, just use the plain text
    if (result.length === 0) {
      result.push({ type: 'text', value: text });
    }

    // Trim leading/trailing whitespace from text tokens at the edges
    // (stripped URLs can leave trailing newlines)
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

    return result;
  }, [event]);

  return (
    <div className={cn('whitespace-pre-wrap break-words', className)}>
      {tokens.map((token, i) => {
        switch (token.type) {
          case 'text':
            return <span key={i}>{token.value}</span>;
          case 'link-preview':
            return <LinkPreview key={i} url={token.url} className="my-2" />;
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

// Helper component to display user mentions
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

import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { useEvent } from '@/hooks/useEvent';
import { useAuthor } from '@/hooks/useAuthor';
import { genUserName } from '@/lib/genUserName';
import { timeAgo } from '@/lib/timeAgo';
import { cn } from '@/lib/utils';

/** Bech32 charset used by NIP-19 identifiers. */
const B32 = '023456789acdefghjklmnpqrstuvwxyz';

/** Regex that matches nostr:npub1… and nostr:nprofile1… inside text. */
const MENTION_REGEX = new RegExp(`nostr:(npub1|nprofile1)[${B32}]+`, 'g');

/** A parsed segment of embedded-note text. */
type EmbedSegment =
  | { type: 'text'; value: string }
  | { type: 'mention'; pubkey: string; npub: string };

/** Split text into plain strings and mention segments. */
function parseEmbedSegments(text: string): EmbedSegment[] {
  const segments: EmbedSegment[] = [];
  let last = 0;
  let m: RegExpExecArray | null;

  MENTION_REGEX.lastIndex = 0;
  while ((m = MENTION_REGEX.exec(text)) !== null) {
    if (m.index > last) {
      segments.push({ type: 'text', value: text.slice(last, m.index) });
    }
    try {
      const bech32 = m[0].slice('nostr:'.length);
      const decoded = nip19.decode(bech32);
      const pubkey = decoded.type === 'npub'
        ? (decoded.data as string)
        : (decoded.data as { pubkey: string }).pubkey;
      const npub = nip19.npubEncode(pubkey);
      segments.push({ type: 'mention', pubkey, npub });
    } catch {
      // If decode fails, keep as plain text
      segments.push({ type: 'text', value: m[0] });
    }
    last = m.index + m[0].length;
  }

  if (last < text.length) {
    segments.push({ type: 'text', value: text.slice(last) });
  }

  return segments;
}

interface EmbeddedNoteProps {
  /** Hex event ID to fetch and display. */
  eventId: string;
  className?: string;
}

/** Maximum characters of note content to show in the embedded preview. */
const MAX_CONTENT_LENGTH = 280;

/** Inline embedded note card – similar to a link preview but for Nostr events. */
export function EmbeddedNote({ eventId, className }: EmbeddedNoteProps) {
  const { data: event, isLoading, isError } = useEvent(eventId);

  if (isLoading) {
    return <EmbeddedNoteSkeleton className={className} />;
  }

  if (isError || !event) {
    return null;
  }

  return <EmbeddedNoteCard event={event} className={className} />;
}

/** The actual card once the event has been fetched. */
function EmbeddedNoteCard({
  event,
  className,
}: {
  event: { id: string; pubkey: string; content: string; created_at: number; tags: string[][] };
  className?: string;
}) {
  const navigate = useNavigate();
  const author = useAuthor(event.pubkey);
  const metadata = author.data?.metadata;
  const displayName = metadata?.name || genUserName(event.pubkey);
  const npub = useMemo(() => nip19.npubEncode(event.pubkey), [event.pubkey]);
  const neventId = useMemo(
    () => nip19.neventEncode({ id: event.id, author: event.pubkey }),
    [event.id, event.pubkey],
  );

  // Truncate long content, stripping media URLs and nested nostr event references
  const truncatedContent = useMemo(() => {
    const cleaned = event.content
      // Strip media URLs
      .replace(/https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp|svg|mp4|webm|mov|mp3|ogg|wav|pdf)(\?[^\s]*)?/gi, '')
      // Strip embedded event references (nevent / note) so they don't nest
      .replace(/nostr:(nevent1|note1)[023456789acdefghjklmnpqrstuvwxyz]+/g, '')
      // Collapse leftover whitespace
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    if (cleaned.length <= MAX_CONTENT_LENGTH) return cleaned;
    return cleaned.slice(0, MAX_CONTENT_LENGTH).trimEnd() + '…';
  }, [event.content]);

  // Extract first image for a small thumbnail
  const firstImage = useMemo(() => {
    const match = event.content.match(
      /https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp|svg)(\?[^\s]*)?/i,
    );
    return match?.[0] ?? null;
  }, [event.content]);

  return (
    <div
      className={cn(
        'group block rounded-2xl border border-border overflow-hidden',
        'hover:bg-secondary/40 transition-colors cursor-pointer',
        className,
      )}
      role="link"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        navigate(`/${neventId}`);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          navigate(`/${neventId}`);
        }
      }}
    >
      {/* Optional image thumbnail */}
      {firstImage && (
        <div className="w-full overflow-hidden border-b border-border bg-muted">
          <img
            src={firstImage}
            alt=""
            className="w-full h-auto max-h-[200px] object-cover"
            loading="lazy"
            onError={(e) => {
              (e.currentTarget.parentElement as HTMLElement).style.display = 'none';
            }}
          />
        </div>
      )}

      {/* Note content */}
      <div className="px-3.5 py-2.5 space-y-1.5">
        {/* Author row */}
        <div className="flex items-center gap-2 min-w-0">
          {author.isLoading ? (
            <>
              <Skeleton className="size-5 rounded-full shrink-0" />
              <Skeleton className="h-3.5 w-24" />
            </>
          ) : (
            <>
              <Link
                to={`/${npub}`}
                className="shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
                <Avatar className="size-5">
                  <AvatarImage src={metadata?.picture} alt={displayName} />
                  <AvatarFallback className="bg-primary/20 text-primary text-[10px]">
                    {displayName[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </Link>

              <Link
                to={`/${npub}`}
                className="text-sm font-semibold truncate hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                {displayName}
              </Link>
            </>
          )}

          <span className="text-xs text-muted-foreground shrink-0">
            · {timeAgo(event.created_at)}
          </span>
        </div>

        {/* Text preview with inline mentions */}
        {truncatedContent && (
          <EmbedContentPreview text={truncatedContent} />
        )}
      </div>
    </div>
  );
}

/** Renders embedded-note text with @mentions resolved inline. */
function EmbedContentPreview({ text }: { text: string }) {
  const segments = useMemo(() => parseEmbedSegments(text), [text]);

  return (
    <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap break-words line-clamp-4">
      {segments.map((seg, i) => {
        if (seg.type === 'text') {
          return <span key={i}>{seg.value}</span>;
        }
        return <EmbedMention key={i} pubkey={seg.pubkey} npub={seg.npub} />;
      })}
    </p>
  );
}

/** Inline @mention inside an embedded note preview. */
function EmbedMention({ pubkey, npub }: { pubkey: string; npub: string }) {
  const author = useAuthor(pubkey);
  const hasRealName = !!author.data?.metadata?.name;
  const displayName = author.data?.metadata?.name ?? genUserName(pubkey);

  return (
    <Link
      to={`/${npub}`}
      className={cn(
        'font-medium hover:underline',
        hasRealName ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
      )}
      onClick={(e) => e.stopPropagation()}
    >
      @{displayName}
    </Link>
  );
}

function EmbeddedNoteSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-2xl border border-border overflow-hidden', className)}>
      <div className="px-3.5 py-2.5 space-y-2">
        <div className="flex items-center gap-2">
          <Skeleton className="size-5 rounded-full" />
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-3 w-10" />
        </div>
        <div className="space-y-1.5">
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-4/5" />
        </div>
      </div>
    </div>
  );
}

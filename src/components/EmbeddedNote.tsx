import { type ReactNode, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import { Image, Film, Music, ExternalLink, Blocks, MessageSquareOff } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { getAvatarShape } from '@/lib/avatarShape';
import { Skeleton } from '@/components/ui/skeleton';
import { EmojifiedText } from '@/components/CustomEmoji';
import { ProfileHoverCard } from '@/components/ProfileHoverCard';
import { VanishCardCompact } from '@/components/VanishEventContent';
import { useEvent } from '@/hooks/useEvent';
import { useAuthor } from '@/hooks/useAuthor';
import { genUserName } from '@/lib/genUserName';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { timeAgo } from '@/lib/timeAgo';
import { cn } from '@/lib/utils';
import { useAppContext } from '@/hooks/useAppContext';
import { IMAGE_URL_REGEX, IMETA_MEDIA_URL_REGEX, extractVideoUrls, extractAudioUrls } from '@/lib/mediaUrls';

/** NIP-62 Request to Vanish. */
const VANISH_KIND = 62;

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
  /** Optional relay hints from the nevent1 identifier. */
  relays?: string[];
  /** Optional author pubkey hint from the nevent1 identifier. */
  authorHint?: string;
  className?: string;
  /** When true, ProfileHoverCards inside the card are disabled to prevent nested hover cards. */
  disableHoverCards?: boolean;
}

/** Maximum characters of note content to show in the embedded preview. */
const MAX_CONTENT_LENGTH = 280;

/** Inline embedded note card – similar to a link preview but for Nostr events. */
export function EmbeddedNote({ eventId, relays, authorHint, className, disableHoverCards }: EmbeddedNoteProps) {
  const { data: event, isLoading, isError } = useEvent(eventId, relays, authorHint);

  if (isLoading) {
    return <EmbeddedNoteSkeleton className={className} />;
  }

  if (isError || !event) {
    return <EmbeddedNoteTombstone eventId={eventId} relays={relays} authorHint={authorHint} className={className} />;
  }

  // NIP-62 vanish events get their own dramatic inline card
  if (event.kind === VANISH_KIND) {
    return <EmbeddedVanishCardWrapper event={event} className={className} />;
  }

  return <EmbeddedNoteCard event={event} className={className} disableHoverCards={disableHoverCards} />;
}

/** The actual card once the event has been fetched. */
function EmbeddedNoteCard({
  event,
  className,
  disableHoverCards,
}: {
  event: { id: string; pubkey: string; content: string; created_at: number; tags: string[][] };
  className?: string;
  disableHoverCards?: boolean;
}) {
  const { config } = useAppContext();
  const navigate = useNavigate();
  const author = useAuthor(event.pubkey);

  const metadata = author.data?.metadata;
  const avatarShape = getAvatarShape(metadata);
  const displayName = metadata?.name || genUserName(event.pubkey);
  const profileUrl = useProfileUrl(event.pubkey, metadata);
  const neventId = useMemo(
    () => nip19.neventEncode({ id: event.id, author: event.pubkey }),
    [event.id, event.pubkey],
  );

  // Truncate long content, stripping media URLs and nested nostr event references
  const truncatedContent = useMemo(() => {
    const cleaned = event.content
      // Strip media URLs (same extensions as NoteContent's MEDIA_URL_REGEX)
      .replace(new RegExp(IMETA_MEDIA_URL_REGEX.source, 'gi'), '')
      // Strip embedded event references (nevent / note) so they don't nest
      .replace(/nostr:(nevent1|note1)[023456789acdefghjklmnpqrstuvwxyz]+/g, '')
      // Collapse leftover whitespace
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    if (cleaned.length <= MAX_CONTENT_LENGTH) return cleaned;
    return cleaned.slice(0, MAX_CONTENT_LENGTH).trimEnd() + '…';
  }, [event.content]);

  // For non-text kinds with empty content, extract title/description from tags
  const tagMeta = useMemo(() => {
    if (truncatedContent) return undefined;
    const getTag = (name: string) => event.tags.find(([n]) => n === name)?.[1];
    const title = getTag('title') || getTag('name') || getTag('d');
    const description = getTag('summary') || getTag('description');
    if (!title && !description) return undefined;
    return { title, description };
  }, [truncatedContent, event.tags]);

  // Extract first image for a small thumbnail
  const firstImage = useMemo(() => {
    return event.content.match(IMAGE_URL_REGEX)?.[0] ?? null;
  }, [event.content]);

  // Detect stripped attachments to show indicator chips
  const attachments = useMemo(() => {
    const imgs = (event.content.match(new RegExp(IMAGE_URL_REGEX.source, 'gi')) || []).length;
    const vids = extractVideoUrls(event.content).length;
    const auds = extractAudioUrls(event.content).length;
    const apps = (event.content.match(/https?:\/\/[^\s]+\.xdc(\?[^\s]*)?/gi) || []).length;
    const allUrls = event.content.match(/https?:\/\/[^\s]+/g) || [];
    const links = allUrls.filter((u) => !IMETA_MEDIA_URL_REGEX.test(u)).length;
    return { imgs, vids, auds, apps, links };
  }, [event.content]);

  // NIP-36 content-warning check
  const cwTag = event.tags.find(([name]) => name === 'content-warning');
  const hasCW = !!cwTag;

  // If policy is "hide", don't render the embedded note at all
  if (hasCW && config.contentWarningPolicy === 'hide') {
    return null;
  }

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
      {/* Optional image thumbnail — skip when content-warning is blurred */}
      {firstImage && !(hasCW && config.contentWarningPolicy === 'blur') && (
        <div className="w-full overflow-hidden">
          <img
            src={firstImage}
            alt=""
            className="w-full h-[160px] object-cover"
            loading="lazy"
            onError={(e) => {
              (e.currentTarget.parentElement as HTMLElement).style.display = 'none';
            }}
          />
        </div>
      )}

      {/* Note content */}
      <div className="px-3 py-2 space-y-1">
        {/* Author row */}
        <div className="flex items-center gap-2 min-w-0">
          {author.isLoading ? (
            <>
              <Skeleton className="size-5 rounded-full shrink-0" />
              <Skeleton className="h-3.5 w-24" />
            </>
          ) : (
            <>
              <MaybeProfileHoverCard pubkey={event.pubkey} disabled={disableHoverCards}>
                <Link
                  to={profileUrl}
                  className="shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Avatar shape={avatarShape} className="size-5">
                    <AvatarImage src={metadata?.picture} alt={displayName} />
                    <AvatarFallback className="bg-primary/20 text-primary text-[10px]">
                      {displayName[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </Link>
              </MaybeProfileHoverCard>

              <MaybeProfileHoverCard pubkey={event.pubkey} disabled={disableHoverCards}>
                <Link
                  to={profileUrl}
                  className="text-sm font-semibold truncate hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  {author.data?.event ? (
                    <EmojifiedText tags={author.data.event.tags}>{displayName}</EmojifiedText>
                  ) : displayName}
                </Link>
              </MaybeProfileHoverCard>
            </>
          )}

          <span className="text-xs text-muted-foreground shrink-0">
            · {timeAgo(event.created_at)}
          </span>
        </div>

        {/* Content warning notice or text preview or tag-based metadata */}
        {hasCW && config.contentWarningPolicy === 'blur' ? (
          <p className="text-xs text-muted-foreground italic">
            Content warning{cwTag?.[1] ? <>{' '}&ldquo;{cwTag[1]}&rdquo;</> : ''}
          </p>
        ) : truncatedContent ? (
          <EmbedContentPreview text={truncatedContent} disableHoverCards={disableHoverCards} />
        ) : tagMeta ? (
          <>
            {tagMeta.title && (
              <p className="text-sm font-semibold leading-snug line-clamp-2">{tagMeta.title}</p>
            )}
            {tagMeta.description && (
              <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">{tagMeta.description}</p>
            )}
          </>
        ) : null}

        {/* Attachment indicators for stripped media/links */}
        {!hasCW && (attachments.imgs > (firstImage ? 1 : 0) || attachments.vids > 0 || attachments.auds > 0 || attachments.apps > 0 || attachments.links > 0) && (
          <div className="flex items-center gap-2 flex-wrap">
            {attachments.imgs > (firstImage ? 1 : 0) && (
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <Image className="size-3" />
                {attachments.imgs > 1 ? `${attachments.imgs} images` : '1 image'}
              </span>
            )}
            {attachments.vids > 0 && (
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <Film className="size-3" />
                {attachments.vids > 1 ? `${attachments.vids} videos` : 'Video'}
              </span>
            )}
            {attachments.auds > 0 && (
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <Music className="size-3" />
                {attachments.auds > 1 ? `${attachments.auds} audio files` : 'Audio'}
              </span>
            )}
            {attachments.apps > 0 && (
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <Blocks className="size-3" />
                App
              </span>
            )}
            {attachments.links > 0 && (
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <ExternalLink className="size-3" />
                {attachments.links > 1 ? `${attachments.links} links` : 'Link'}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Renders embedded-note text with @mentions resolved inline. */
function EmbedContentPreview({ text, disableHoverCards }: { text: string; disableHoverCards?: boolean }) {
  const segments = useMemo(() => parseEmbedSegments(text), [text]);

  return (
    <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap break-words overflow-hidden line-clamp-3">
      {segments.map((seg, i) => {
        if (seg.type === 'text') {
          return <span key={i}>{seg.value}</span>;
        }
        return <EmbedMention key={i} pubkey={seg.pubkey} npub={seg.npub} disableHoverCards={disableHoverCards} />;
      })}
    </p>
  );
}

/** Inline @mention inside an embedded note preview. */
function EmbedMention({ pubkey, disableHoverCards }: { pubkey: string; npub: string; disableHoverCards?: boolean }) {
  const author = useAuthor(pubkey);
  const hasRealName = !!author.data?.metadata?.name;
  const displayName = author.data?.metadata?.name ?? genUserName(pubkey);
  const profileUrl = useProfileUrl(pubkey, author.data?.metadata);

  return (
    <MaybeProfileHoverCard pubkey={pubkey} disabled={disableHoverCards}>
      <Link
        to={profileUrl}
        className={cn(
          'font-medium hover:underline',
          hasRealName ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        @{author.data?.event ? (
          <EmojifiedText tags={author.data.event.tags}>{displayName}</EmojifiedText>
        ) : displayName}
      </Link>
    </MaybeProfileHoverCard>
  );
}

/** Conditionally wraps children in a ProfileHoverCard. When disabled, renders children directly. */
function MaybeProfileHoverCard({ pubkey, disabled, children }: { pubkey: string; disabled?: boolean; children: ReactNode }) {
  if (disabled) {
    return <>{children}</>;
  }
  return (
    <ProfileHoverCard pubkey={pubkey} asChild>
      {children}
    </ProfileHoverCard>
  );
}

/** Clickable wrapper around VanishCardCompact for embedded/quoted vanish events. */
function EmbeddedVanishCardWrapper({
  event,
  className,
}: {
  event: { id: string; pubkey: string; content: string; created_at: number; tags: string[][] };
  className?: string;
}) {
  const navigate = useNavigate();
  const neventId = useMemo(
    () => nip19.neventEncode({ id: event.id, author: event.pubkey }),
    [event.id, event.pubkey],
  );

  return (
    <div
      className={cn('group cursor-pointer', className)}
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
      <VanishCardCompact
        event={event}
        timestamp={timeAgo(event.created_at)}
        className="rounded-2xl group-hover:border-red-500/50 transition-colors"
      />
    </div>
  );
}

/** Tombstone shown when a quoted note could not be loaded. */
function EmbeddedNoteTombstone({ eventId, relays, authorHint, className }: { eventId: string; relays?: string[]; authorHint?: string; className?: string }) {
  const navigate = useNavigate();

  const neventId = useMemo(
    () => nip19.neventEncode({
      id: eventId,
      ...(authorHint ? { author: authorHint } : {}),
      ...(relays?.length ? { relays } : {}),
    }),
    [eventId, authorHint, relays],
  );

  return (
    <div
      className={cn(
        'rounded-2xl border border-dashed border-border overflow-hidden',
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
      <div className="px-3.5 py-4 flex items-center gap-2 text-muted-foreground">
        <MessageSquareOff className="size-4 shrink-0" />
        <span className="text-sm">This post could not be loaded</span>
      </div>
    </div>
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

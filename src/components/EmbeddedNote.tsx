import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';
import { Image, Film, Music, ExternalLink, Blocks, MessageSquareOff } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { EmbeddedCardShell } from '@/components/EmbeddedCardShell';
import { VanishCardCompact } from '@/components/VanishEventContent';
import { EncryptedMessageCompact } from '@/components/EncryptedMessageContent';
import { EncryptedLetterCompact } from '@/components/EncryptedLetterContent';
import { EmbeddedProfileBadgesCard } from '@/components/EmbeddedNaddr';
import { NoteContent } from '@/components/NoteContent';
import { useEvent } from '@/hooks/useEvent';
import { isProfileBadgesKind } from '@/lib/badgeUtils';
import { timeAgo } from '@/lib/timeAgo';
import { cn } from '@/lib/utils';
import { useAppContext } from '@/hooks/useAppContext';
import { IMAGE_URL_REGEX, IMETA_MEDIA_URL_TEST_REGEX, extractVideoUrls, extractAudioUrls } from '@/lib/mediaUrls';
import { getKindLabel, getKindIcon } from '@/lib/extraKinds';

const BlobbiStateCard = lazy(() => import('@/components/BlobbiStateCard').then(m => ({ default: m.BlobbiStateCard })));

/** NIP-62 Request to Vanish. */
const VANISH_KIND = 62;

/** Max-height (px) for the content area before it gets clipped. */
const EMBED_MAX_HEIGHT = 260;

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

  // Kind 4 encrypted DMs get a compact card instead of rendering ciphertext
  if (event.kind === 4) {
    return <EncryptedMessageCompact event={event} className={className} />;
  }

  // Kind 8211 encrypted letters get a compact card
  if (event.kind === 8211) {
    return <EncryptedLetterCompact event={event} className={className} />;
  }

  // Profile badges (kind 10008/30008) get a compact badge row preview
  if (isProfileBadgesKind(event.kind)) {
    return <EmbeddedProfileBadgesCard event={event} className={className} />;
  }

  return <EmbeddedNoteCard event={event} className={className} disableHoverCards={disableHoverCards} />;
}

/** The actual card once the event has been fetched. */
function EmbeddedNoteCard({
  event,
  className,
  disableHoverCards,
}: {
  event: NostrEvent;
  className?: string;
  disableHoverCards?: boolean;
}) {
  const { config } = useAppContext();

  const neventId = useMemo(
    () => nip19.neventEncode({ id: event.id, author: event.pubkey }),
    [event.id, event.pubkey],
  );

  const [contentOverflows, setContentOverflows] = useState(false);
  const [contentExpanded, setContentExpanded] = useState(false);

  const isBlobbiState = event.kind === 31124;
  const isPhoto = event.kind === 20;

  // Attachment counts for indicator chips
  const attachments = useMemo(() => {
    if (isBlobbiState) return { imgs: 0, vids: 0, auds: 0, apps: 0, links: 0, photos: 0 };
    if (isPhoto) {
      const photoCount = event.tags.filter(([n]) => n === 'imeta').length;
      return { imgs: 0, vids: 0, auds: 0, apps: 0, links: 0, photos: photoCount };
    }
    const imgs = (event.content.match(new RegExp(IMAGE_URL_REGEX.source, 'gi')) || []).length;
    const vids = extractVideoUrls(event.content).length;
    const auds = extractAudioUrls(event.content).length;
    const apps = (event.content.match(/https?:\/\/[^\s]+\.xdc(\?[^\s]*)?/gi) || []).length;
    const allUrls = event.content.match(/https?:\/\/[^\s]+/g) || [];
    const links = allUrls.filter((u) => !IMETA_MEDIA_URL_TEST_REGEX.test(u)).length;
    return { imgs, vids, auds, apps, links, photos: 0 };
  }, [event.content, event.tags, isPhoto, isBlobbiState]);

  // Kind label for non-text-note kinds
  const kindMeta = useMemo(() => {
    const label = getKindLabel(event.kind);
    if (!label) return undefined;
    return { label, Icon: getKindIcon(event.kind) };
  }, [event.kind]);

  // Tag-based fallback metadata for events with empty content (articles, custom kinds, etc.)
  const hasContent = event.content.trim().length > 0;
  const tagMeta = useMemo(() => {
    if (hasContent) return undefined;
    const getTag = (name: string) => event.tags.find(([n]) => n === name)?.[1];
    const title = getTag('title') || getTag('name') || getTag('d');
    const description = getTag('summary') || getTag('description');
    if (!title && !description) return undefined;
    return { title, description };
  }, [hasContent, event.tags]);

  // NIP-36 content-warning check
  const cwTag = event.tags.find(([name]) => name === 'content-warning');
  const hasCW = !!cwTag;

  // If policy is "hide", don't render the embedded note at all
  if (hasCW && config.contentWarningPolicy === 'hide') {
    return null;
  }

  const hasChips = !hasCW && (
    attachments.photos > 0 || attachments.imgs > 0 || attachments.vids > 0 ||
    attachments.auds > 0 || attachments.apps > 0 || attachments.links > 0 || kindMeta
  );
  const hasFooter = hasChips || contentOverflows;

  return (
    <EmbeddedCardShell
      pubkey={event.pubkey}
      createdAt={event.created_at}
      navigateTo={neventId}
      className={className}
      disableHoverCards={disableHoverCards}
    >
      {/* Content — rendered identically to a normal NoteCard, just height-capped */}
      {hasCW && config.contentWarningPolicy === 'blur' ? (
        <p className="text-xs text-muted-foreground italic">
          Content warning{cwTag?.[1] ? <>{' '}&ldquo;{cwTag[1]}&rdquo;</> : ''}
        </p>
      ) : isBlobbiState ? (
        <Suspense fallback={<Skeleton className="h-24 w-full rounded-lg" />}>
          <BlobbiStateCard event={event} />
        </Suspense>
      ) : tagMeta ? (
        <>
          {tagMeta.title && (
            <p className="text-sm font-semibold leading-snug line-clamp-2">{tagMeta.title}</p>
          )}
          {tagMeta.description && (
            <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">{tagMeta.description}</p>
          )}
        </>
      ) : (
        <EmbedTruncatedContent event={event} expanded={contentExpanded} onOverflowChange={setContentOverflows} />
      )}

      {/* Attachment / kind indicator chips + Read more toggle */}
      {hasFooter && (
        <div className="flex items-center gap-2 flex-wrap">
          {kindMeta && (
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              {kindMeta.Icon && <kindMeta.Icon className="size-3 shrink-0" />}
              {kindMeta.label}
            </span>
          )}
          {attachments.photos > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <Image className="size-3" />
              {attachments.photos > 1 ? `${attachments.photos} photos` : 'Photo'}
            </span>
          )}
          {attachments.imgs > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <Image className="size-3" />
              {attachments.imgs > 1 ? `${attachments.imgs} images` : 'Image'}
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
          {contentOverflows && (
            <button
              className="ml-auto text-xs text-primary hover:underline shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                setContentExpanded((v) => !v);
              }}
            >
              {contentExpanded ? 'Show less' : 'Read more'}
            </button>
          )}
        </div>
      )}
    </EmbeddedCardShell>
  );
}

/** Truncated content area with overflow detection. Toggle is rendered externally. */
function EmbedTruncatedContent({ event, expanded, onOverflowChange }: {
  event: NostrEvent;
  expanded: boolean;
  onOverflowChange: (overflows: boolean) => void;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);

  const measure = useCallback(() => {
    const el = contentRef.current;
    if (!el) return;
    const doesOverflow = el.scrollHeight > EMBED_MAX_HEIGHT;
    setOverflows(doesOverflow);
    onOverflowChange(doesOverflow);
  }, [onOverflowChange]);

  useEffect(() => {
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);

  // Re-measure after images load
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const imgs = el.querySelectorAll('img');
    if (imgs.length === 0) return;
    imgs.forEach((img) => img.addEventListener('load', measure, { once: true }));
    return () => imgs.forEach((img) => img.removeEventListener('load', measure));
  }, [measure]);

  return (
    <div
      ref={contentRef}
      className="relative overflow-hidden"
      style={!expanded && overflows ? { maxHeight: EMBED_MAX_HEIGHT } : undefined}
    >
      <NoteContent event={event} className="text-sm leading-relaxed" disableMediaEmbeds disableNoteEmbeds />
      {!expanded && overflows && (
        <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-background to-transparent pointer-events-none" />
      )}
    </div>
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

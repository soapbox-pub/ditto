import { lazy, type ReactNode, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';
import { Award, Image, Film, Music, ExternalLink, Blocks, MessageSquareOff, Zap } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { EmbeddedCardShell } from '@/components/EmbeddedCardShell';
import { VanishCardCompact } from '@/components/VanishEventContent';
import { EncryptedMessageCompact } from '@/components/EncryptedMessageContent';
import { EncryptedLetterCompact } from '@/components/EncryptedLetterContent';
import { EmbeddedProfileBadgesCard } from '@/components/EmbeddedNaddr';
import { EmbeddedPeopleListCard } from '@/components/EmbeddedPeopleListCard';
import { isPeopleListKind } from '@/lib/packUtils';
import { EmojifiedText } from '@/components/CustomEmoji';
import { ProfileHoverCard } from '@/components/ProfileHoverCard';
import { NoteContent } from '@/components/NoteContent';
import { useEvent } from '@/hooks/useEvent';
import { useAuthor } from '@/hooks/useAuthor';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { BADGE_AWARD_KIND, BADGE_DEFINITION_KIND, isProfileBadgesKind, parseBadgeATag, unslugify } from '@/lib/badgeUtils';
import { useBadgeDefinitions } from '@/hooks/useBadgeDefinitions';
import { BadgeThumbnail } from '@/components/BadgeThumbnail';
import { extractZapAmount, extractZapSender, extractZapMessage } from '@/hooks/useEventInteractions';
import { getAvatarShape } from '@/lib/avatarShape';
import { genUserName } from '@/lib/genUserName';
import { formatNumber } from '@/lib/formatNumber';
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

  // Kind 9735 zap receipts get a compact zap card instead of rendering raw JSON
  if (event.kind === 9735) {
    return <EmbeddedZapCard event={event} className={className} disableHoverCards={disableHoverCards} />;
  }

  // Kind 8 badge award events get a compact badge card
  if (event.kind === BADGE_AWARD_KIND) {
    return <EmbeddedBadgeAwardCard event={event} className={className} disableHoverCards={disableHoverCards} />;
  }

  // People-list events (kind 3 follow lists) get a dedicated card showing
  // title + avatar stack + member count. The generic fallback renders empty
  // because all the data lives in `p` tags, not content or title tags.
  if (isPeopleListKind(event.kind)) {
    return <EmbeddedPeopleListCard event={event} className={className} disableHoverCards={disableHoverCards} />;
  }

  return <EmbeddedNoteCard event={event} className={className} disableHoverCards={disableHoverCards} />;
}

/** Compact inline card for kind 8 NIP-58 badge award events. */
function EmbeddedBadgeAwardCard({ event, className, disableHoverCards }: { event: NostrEvent; className?: string; disableHoverCards?: boolean }) {
  const navigate = useNavigate();

  const neventId = useMemo(
    () => nip19.neventEncode({ id: event.id, author: event.pubkey }),
    [event.id, event.pubkey],
  );

  const parsed = useMemo(() => parseBadgeATag(event), [event]);
  // NIP-58: only the badge owner can validly award their own badge.
  const validParsed = parsed && parsed.pubkey === event.pubkey ? parsed : undefined;
  const badgeRef = useMemo(() => (validParsed ? [validParsed] : []), [validParsed]);
  const { badgeMap } = useBadgeDefinitions(badgeRef);

  const aTag = validParsed
    ? `${BADGE_DEFINITION_KIND}:${validParsed.pubkey}:${validParsed.identifier}`
    : undefined;
  const badge = aTag ? badgeMap.get(aTag) : undefined;
  const badgeName = badge?.name || (validParsed ? unslugify(validParsed.identifier) : 'Badge');

  const issuer = useAuthor(event.pubkey);
  const issuerMeta = issuer.data?.metadata;
  const issuerName = issuerMeta?.name || genUserName(event.pubkey);
  const issuerProfileUrl = useProfileUrl(event.pubkey, issuerMeta);

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
      <div className="px-3 py-2.5 flex items-center gap-2.5 min-w-0">
        {/* Badge thumbnail or fallback icon */}
        {badge ? (
          <BadgeThumbnail badge={badge} size={36} className="shrink-0" />
        ) : (
          <div className="flex items-center justify-center size-9 rounded-lg bg-gradient-to-br from-primary/10 via-primary/5 to-transparent shrink-0">
            <Award className="size-4 text-primary" />
          </div>
        )}

        {/* Text */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <MaybeHoverCard pubkey={event.pubkey} disabled={disableHoverCards}>
              <Link
                to={issuerProfileUrl}
                className="text-sm font-semibold truncate hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                {issuer.data?.event ? (
                  <EmojifiedText tags={issuer.data.event.tags}>{issuerName}</EmojifiedText>
                ) : issuerName}
              </Link>
            </MaybeHoverCard>
            <span className="text-sm text-muted-foreground">awarded a badge</span>
            <span className="text-xs text-muted-foreground shrink-0">
              · {timeAgo(event.created_at)}
            </span>
          </div>
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {badgeName}
          </p>
        </div>
      </div>
    </div>
  );
}

/** Compact inline card for kind 9735 zap receipts. */
function EmbeddedZapCard({ event, className, disableHoverCards }: { event: NostrEvent; className?: string; disableHoverCards?: boolean }) {
  const navigate = useNavigate();

  const neventId = useMemo(
    () => nip19.neventEncode({ id: event.id, author: event.pubkey }),
    [event.id, event.pubkey],
  );

  const senderPubkey = useMemo(() => extractZapSender(event), [event]);
  const amountSats = useMemo(() => Math.floor(extractZapAmount(event) / 1000), [event]);
  const message = useMemo(() => extractZapMessage(event), [event]);

  const sender = useAuthor(senderPubkey || undefined);
  const senderMeta = sender.data?.metadata;
  const senderName = senderMeta?.name || (senderPubkey ? genUserName(senderPubkey) : 'Someone');
  const senderShape = getAvatarShape(senderMeta);
  const senderProfileUrl = useProfileUrl(senderPubkey, senderMeta);

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
      <div className="px-3 py-2.5 flex items-center gap-2.5 min-w-0">
        {/* Zap icon */}
        <div className="flex items-center justify-center size-9 rounded-full bg-amber-500/10 shrink-0">
          <Zap className="size-4 text-amber-500 fill-amber-500" />
        </div>

        {/* Sender avatar */}
        {senderPubkey && (
          <MaybeHoverCard pubkey={senderPubkey} disabled={disableHoverCards}>
            <Link to={senderProfileUrl} className="shrink-0" onClick={(e) => e.stopPropagation()}>
              <Avatar shape={senderShape} className="size-5">
                <AvatarImage src={senderMeta?.picture} alt={senderName} />
                <AvatarFallback className="bg-primary/20 text-primary text-[10px]">
                  {senderName[0]?.toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </Link>
          </MaybeHoverCard>
        )}

        {/* Text */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            {senderPubkey ? (
              <MaybeHoverCard pubkey={senderPubkey} disabled={disableHoverCards}>
                <Link
                  to={senderProfileUrl}
                  className="text-sm font-semibold truncate hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  {sender.data?.event ? (
                    <EmojifiedText tags={sender.data.event.tags}>{senderName}</EmojifiedText>
                  ) : senderName}
                </Link>
              </MaybeHoverCard>
            ) : (
              <span className="text-sm font-semibold truncate">Someone</span>
            )}
            <span className="text-sm text-muted-foreground">zapped</span>
            {amountSats > 0 && (
              <span className="text-sm font-semibold text-amber-500 shrink-0">
                {formatNumber(amountSats)} {amountSats === 1 ? 'sat' : 'sats'}
              </span>
            )}
            <span className="text-xs text-muted-foreground shrink-0">
              · {timeAgo(event.created_at)}
            </span>
          </div>
          {message && (
            <p className="text-xs text-muted-foreground italic mt-0.5 line-clamp-2">
              &ldquo;{message}&rdquo;
            </p>
          )}
        </div>
      </div>
    </div>
  );
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

/** Conditionally wraps children in a ProfileHoverCard. */
function MaybeHoverCard({ pubkey, disabled, children }: { pubkey: string; disabled?: boolean; children: ReactNode }) {
  if (disabled) return <>{children}</>;
  return (
    <ProfileHoverCard pubkey={pubkey} asChild>
      {children}
    </ProfileHoverCard>
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

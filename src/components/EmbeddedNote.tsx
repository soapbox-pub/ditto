import { lazy, type ReactNode, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';
import { Award, BarChart3, Image, Film, Music, ExternalLink, Blocks, MessageSquareOff, Quote, Zap, Clock } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { BrokenEventFallback } from '@/components/BrokenEventFallback';
import { EmbeddedCardShell } from '@/components/EmbeddedCardShell';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { VanishCardCompact } from '@/components/VanishEventContent';
import { EncryptedMessageCompact } from '@/components/EncryptedMessageContent';
import { EncryptedLetterCompact } from '@/components/EncryptedLetterContent';
import { EmbeddedProfileBadgesCard } from '@/components/EmbeddedNaddr';
import { EmbeddedPeopleListCard } from '@/components/EmbeddedPeopleListCard';
import { PeopleAvatarStack } from '@/components/PeopleAvatarStack';
import { isPeopleListKind } from '@/lib/packUtils';
import { EmojifiedText } from '@/components/CustomEmoji';
import { ProfileHoverCard } from '@/components/ProfileHoverCard';
import { NoteContent } from '@/components/NoteContent';
import { useEvent } from '@/hooks/useEvent';
import { useAuthor } from '@/hooks/useAuthor';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { BADGE_AWARD_KIND, BADGE_DEFINITION_KIND, isProfileBadgesEvent, parseBadgeATag, unslugify } from '@/lib/badgeUtils';
import { useBadgeDefinitions } from '@/hooks/useBadgeDefinitions';
import { BadgeThumbnail } from '@/components/BadgeThumbnail';
import { extractZapAmount, extractZapSender, extractZapMessage } from '@/hooks/useEventInteractions';
import { extractOnchainZapClaimedAmount, extractOnchainZapRecipients, useVerifiedOnchainZap } from '@/hooks/useOnchainZaps';
import { getAvatarShape } from '@/lib/avatarShape';
import { useFormatMoney } from '@/hooks/useFormatMoney';
import { timeAgo } from '@/lib/timeAgo';
import { cn } from '@/lib/utils';
import { useAppContext } from '@/hooks/useAppContext';
import { IMAGE_URL_REGEX, IMETA_MEDIA_URL_TEST_REGEX, extractVideoUrls, extractAudioUrls } from '@/lib/mediaUrls';
import { getKindLabel, getKindIcon, getEventFallbackText } from '@/lib/extraKinds';
import { usePollVoteLabel } from '@/hooks/usePollVoteLabel';

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
  /** When set, this excerpt is wrapped in `<mark>` inside the note's rendered
   *  content (used to render a NIP-84 highlight as the marked source note). */
  highlightText?: string;
}

/** Inline embedded note card – similar to a link preview but for Nostr events. */
export function EmbeddedNote(props: EmbeddedNoteProps) {
  return (
    <ErrorBoundary
      fallback={<BrokenEventFallback compact className={props.className} />}
      sentryLevel="error"
      sentryTags={{ errorBoundary: 'embedded-note', eventId: props.eventId }}
      resetKeys={[props.eventId]}
    >
      <EmbeddedNoteInner {...props} />
    </ErrorBoundary>
  );
}

function EmbeddedNoteInner({ eventId, relays, authorHint, className, disableHoverCards, highlightText }: EmbeddedNoteProps) {
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

  // Profile badges (kind 10008 / legacy 30008 with d=profile_badges) get a
  // compact badge row preview. NIP-51 badge sets fall through to the generic
  // embedded card.
  if (isProfileBadgesEvent(event)) {
    return <EmbeddedProfileBadgesCard event={event} className={className} />;
  }

  // Kind 9735 zap receipts get a compact zap card instead of rendering raw JSON
  if (event.kind === 9735) {
    return <EmbeddedZapCard event={event} className={className} disableHoverCards={disableHoverCards} />;
  }

  // Kind 8333 on-chain zaps (see NIP.md) get the same compact treatment as
  // Lightning receipts — the two rails look intentionally identical to
  // readers, mirroring the Zaps tab in InteractionsModal.
  if (event.kind === 8333) {
    return <EmbeddedOnchainZapCard event={event} className={className} disableHoverCards={disableHoverCards} />;
  }

  // Kind 8 badge award events get a compact badge card
  if (event.kind === BADGE_AWARD_KIND) {
    return <EmbeddedBadgeAwardCard event={event} className={className} disableHoverCards={disableHoverCards} />;
  }

  // Kind 9802 NIP-84 highlights get a compact quote card that shows the
  // highlighted excerpt rather than falling through the generic-embed path
  // (which would feed the quoted prose through the kind-1 tokenizer and
  // auto-linkify URLs/hashtags that were in the original source, not in the
  // highlight author's post).
  if (event.kind === 9802) {
    return <EmbeddedHighlightCard event={event} className={className} disableHoverCards={disableHoverCards} />;
  }

  // Kind 1068 NIP-88 polls get a compact card showing the question + a
  // preview of the options. Without this branch, polls fall through to
  // `EmbeddedNoteCard`, which has no concept of `option` tags and would
  // either show the bare `alt` text or tombstone as "not supported" for
  // polls authored by clients that don't include an `alt` tag.
  if (event.kind === 1068) {
    return <EmbeddedPollCard event={event} className={className} disableHoverCards={disableHoverCards} />;
  }

  // Kind 1018 poll votes have empty content and would otherwise tombstone.
  // Render a compact "voted for X" card by resolving the option label from
  // the parent poll.
  if (event.kind === 1018) {
    return <EmbeddedPollVoteCard event={event} className={className} disableHoverCards={disableHoverCards} />;
  }

  // People-list events (kind 3 follow lists) get a dedicated card showing
  // title + avatar stack + member count. The generic fallback renders empty
  // because all the data lives in `p` tags, not content or title tags.
  if (isPeopleListKind(event.kind)) {
    return <EmbeddedPeopleListCard event={event} className={className} disableHoverCards={disableHoverCards} />;
  }

  return <EmbeddedNoteCard event={event} className={className} disableHoverCards={disableHoverCards} highlightText={highlightText} />;
}

/** Compact inline card for kind 9802 NIP-84 highlight events. */
function EmbeddedHighlightCard({
  event,
  className,
  disableHoverCards,
}: {
  event: NostrEvent;
  className?: string;
  disableHoverCards?: boolean;
}) {
  const neventId = useMemo(
    () => nip19.neventEncode({ id: event.id, author: event.pubkey }),
    [event.id, event.pubkey],
  );

  const excerpt = event.content.trim();
  const hasText = excerpt.length > 0;

  return (
    <EmbeddedCardShell
      pubkey={event.pubkey}
      createdAt={event.created_at}
      navigateTo={neventId}
      className={className}
      disableHoverCards={disableHoverCards}
    >
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <Quote className="size-3" />
        Highlight
      </div>
      {hasText ? (
        <blockquote className="relative rounded-r-lg border-l-[3px] border-primary/70 bg-primary/5 pl-3 pr-2 py-2">
          <p className="font-serif text-[14px] leading-relaxed whitespace-pre-wrap break-words line-clamp-4 text-foreground">
            {excerpt}
          </p>
        </blockquote>
      ) : (
        <p className="text-xs italic text-muted-foreground">Highlighted media</p>
      )}
    </EmbeddedCardShell>
  );
}

/**
 * Compact inline card for kind 1068 NIP-88 polls.
 *
 * Renders the poll question (the event `content`) via `NoteContent` so
 * mentions/hashtags inside the question still tokenize correctly, plus a
 * non-interactive preview of the first few `option` tags and a chip row
 * showing poll type (single/multi) and expiry state. Voting happens on
 * the dedicated detail page (click-through), not inline — embeds are
 * read-only previews.
 */
function EmbeddedPollCard({
  event,
  className,
  disableHoverCards,
}: {
  event: NostrEvent;
  className?: string;
  disableHoverCards?: boolean;
}) {
  const neventId = useMemo(
    () => nip19.neventEncode({ id: event.id, author: event.pubkey }),
    [event.id, event.pubkey],
  );

  const options = useMemo(
    () =>
      event.tags
        .filter(([n]) => n === 'option')
        .map(([, , label]) => (label ?? '').trim())
        .filter((label) => label.length > 0),
    [event.tags],
  );
  const pollType = event.tags.find(([n]) => n === 'polltype')?.[1] ?? 'singlechoice';
  const endsAtTag = event.tags.find(([n]) => n === 'endsAt')?.[1];
  const endsAt = endsAtTag ? Number(endsAtTag) : undefined;
  const isExpired =
    typeof endsAt === 'number' && Number.isFinite(endsAt) && endsAt < Math.floor(Date.now() / 1000);

  const MAX_OPTION_PREVIEW = 4;
  const previewOptions = options.slice(0, MAX_OPTION_PREVIEW);
  const remainingOptions = Math.max(0, options.length - MAX_OPTION_PREVIEW);

  return (
    <EmbeddedCardShell
      pubkey={event.pubkey}
      createdAt={event.created_at}
      navigateTo={neventId}
      className={className}
      disableHoverCards={disableHoverCards}
    >
      {/* Question */}
      {event.content.trim().length > 0 && (
        <div className="text-sm leading-relaxed font-medium break-words">
          <NoteContent event={event} disableMediaEmbeds disableNoteEmbeds />
        </div>
      )}

      {/* Poll type + expiry chips */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground bg-secondary/60 px-2 py-0.5 rounded-full">
          <BarChart3 className="size-3" />
          {pollType === 'multiplechoice' ? 'Multiple choice' : 'Poll'}
        </span>
        {isExpired && (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground bg-secondary/60 px-2 py-0.5 rounded-full">
            <Clock className="size-3" />
            Ended
          </span>
        )}
      </div>

      {/* Options preview — non-interactive, just shows option text */}
      {previewOptions.length > 0 && (
        <div className="space-y-1">
          {previewOptions.map((label, i) => (
            <div
              key={i}
              className="rounded-md border border-border px-2.5 py-1.5 text-xs text-foreground bg-secondary/20 break-words line-clamp-1"
            >
              {label}
            </div>
          ))}
          {remainingOptions > 0 && (
            <p className="text-[11px] text-muted-foreground pl-1">
              +{remainingOptions} more option{remainingOptions === 1 ? '' : 's'}
            </p>
          )}
        </div>
      )}
    </EmbeddedCardShell>
  );
}

/**
 * Compact inline card for kind 1018 poll vote events.
 *
 * Vote events have empty `content`, so the generic embedded card would
 * tombstone them as "not supported". We resolve the option label from the
 * parent poll (via `usePollVoteLabel`) and display "voted for X" — same
 * shape used on the feed/detail card for vote events.
 */
function EmbeddedPollVoteCard({
  event,
  className,
  disableHoverCards,
}: {
  event: NostrEvent;
  className?: string;
  disableHoverCards?: boolean;
}) {
  const neventId = useMemo(
    () => nip19.neventEncode({ id: event.id, author: event.pubkey }),
    [event.id, event.pubkey],
  );
  const voteLabel = usePollVoteLabel(event);

  return (
    <EmbeddedCardShell
      pubkey={event.pubkey}
      createdAt={event.created_at}
      navigateTo={neventId}
      className={className}
      disableHoverCards={disableHoverCards}
    >
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <BarChart3 className="size-3" />
        Poll vote
      </div>
      {voteLabel ? (
        <p className="text-sm font-semibold leading-snug line-clamp-2 break-words">
          {voteLabel}
        </p>
      ) : (
        <p className="text-xs italic text-muted-foreground">Voted</p>
      )}
    </EmbeddedCardShell>
  );
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
  const issuerName = issuerMeta?.name || issuerMeta?.display_name || 'Anonymous';
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
  const senderName = senderMeta?.name || senderMeta?.display_name || (senderPubkey ? 'Anonymous' : 'Someone');
  const senderShape = getAvatarShape(senderMeta);
  const senderProfileUrl = useProfileUrl(senderPubkey, senderMeta);
  const { format: formatMoney } = useFormatMoney();

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
                {formatMoney(amountSats)}
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

/**
 * Compact inline card for kind 8333 on-chain zap events (see NIP.md).
 *
 * Visually mirrors `EmbeddedZapCard` so a reader scrolling a feed doesn't
 * have to mentally reconcile two different-looking "someone paid the
 * author" rows. Differences are intentionally minimal: identical amber
 * bolt bubble, avatar, name + "zapped" + amount + timestamp line, and
 * italic message below.
 *
 * The amount shown is the sender's self-reported `amount` tag until the
 * blockchain verification resolves, at which point we swap in the verified
 * amount. If verification fails (bogus tx, self-zap, wrong recipient) we
 * render a muted "unverified" tag so the card doesn't silently lie.
 */
function EmbeddedOnchainZapCard({ event, className, disableHoverCards }: { event: NostrEvent; className?: string; disableHoverCards?: boolean }) {
  const navigate = useNavigate();

  const neventId = useMemo(
    () => nip19.neventEncode({ id: event.id, author: event.pubkey }),
    [event.id, event.pubkey],
  );

  // Sender authors the 8333 event themselves (unlike 9735 where the LNURL
  // server is the author and the sender lives in a P tag).
  const senderPubkey = event.pubkey;
  const claimed = useMemo(() => extractOnchainZapClaimedAmount(event), [event]);
  const recipientPubkeys = useMemo(() => extractOnchainZapRecipients(event), [event]);
  const isMultiRecipient = recipientPubkeys.length > 1;
  const verified = useVerifiedOnchainZap(event);
  const amountSats = verified?.amountSats ?? claimed;
  const isVerifying = verified === undefined;
  const failedVerification = verified === null;
  const message = event.content;

  const sender = useAuthor(senderPubkey);
  const senderMeta = sender.data?.metadata;
  const senderName = senderMeta?.name || senderMeta?.display_name || 'Anonymous';
  const senderShape = getAvatarShape(senderMeta);
  const senderProfileUrl = useProfileUrl(senderPubkey, senderMeta);
  const { format: formatMoney } = useFormatMoney();

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
        {/* Zap icon — same amber bubble as Lightning. */}
        <div className="flex items-center justify-center size-9 rounded-full bg-amber-500/10 shrink-0">
          <Zap className="size-4 text-amber-500 fill-amber-500" />
        </div>

        {/* Sender avatar */}
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

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
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
            <span className="text-sm text-muted-foreground">
              zapped
              {isMultiRecipient && ` ${recipientPubkeys.length} people`}
            </span>
            {isMultiRecipient && (
              <PeopleAvatarStack
                pubkeys={recipientPubkeys}
                size="sm"
                maxVisible={4}
                className="shrink-0"
              />
            )}
            {amountSats > 0 && (
              <span className="text-sm font-semibold text-amber-500 shrink-0">
                {formatMoney(amountSats)}
              </span>
            )}
            {/* Muted hint that this is an on-chain rather than Lightning zap,
                and that the amount is either verifying or couldn't be verified. */}
            {failedVerification ? (
              <span className="text-[11px] text-muted-foreground shrink-0">· unverified</span>
            ) : isVerifying ? (
              <span className="text-[11px] text-muted-foreground shrink-0">· verifying…</span>
            ) : null}
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
  highlightText,
}: {
  event: NostrEvent;
  className?: string;
  disableHoverCards?: boolean;
  highlightText?: string;
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
  // Kinds whose `content` is a human-readable body/caption and can safely
  // be fed through the kind-1 tokenizer for preview. Everything else
  // (articles, streams, videos, calendar events, themes, polls, voice
  // messages, unknown custom kinds, …) should prefer a tag-based summary
  // — otherwise we'd parse JSON or arbitrary content as text.
  const isContentKind =
    event.kind === 1 || event.kind === 11 || event.kind === 1111 || isPhoto;

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

  // Tag-based fallback metadata for non-content kinds (articles, custom
  // kinds, etc.) and for text notes that happen to have empty content.
  const hasContent = event.content.trim().length > 0;
  const tagMeta = useMemo(() => {
    // Content kinds with real content always render that content below.
    if (isContentKind && hasContent) return undefined;
    // NIP-31 `alt` is the author's own fallback for clients that can't
    // render the kind. Other tags (title, name, d, …) have kind-specific
    // semantics and are not reliably safe as user-facing preview text.
    const altText = getEventFallbackText(event);
    if (!altText) return undefined;
    return { title: altText, description: undefined as string | undefined };
  }, [isContentKind, hasContent, event]);

  // Truly unknown kind: not a content kind, no Blobbi inline visual, no `alt`
  // fallback text, AND we don't recognize the kind via `getKindLabel`. Only
  // these get the "This event kind is not supported" tombstone. Kinds Ditto
  // knows about (via `EXTRA_KINDS`) but that the author authored without an
  // `alt` tag get a kind-labeled card showing the icon + label centrally,
  // so the embed at least communicates what type of content it points to.
  const isUnknownKind = !isContentKind && !isBlobbiState && !tagMeta && !kindMeta;
  const isKnownKindWithoutPreview = !isContentKind && !isBlobbiState && !tagMeta && !!kindMeta;

  // NIP-36 content-warning check
  const cwTag = event.tags.find(([name]) => name === 'content-warning');
  const hasCW = !!cwTag;

  // If policy is "hide", don't render the embedded note at all
  if (hasCW && config.contentWarningPolicy === 'hide') {
    return null;
  }

  const hasChips = !hasCW && (
    attachments.photos > 0 || attachments.imgs > 0 || attachments.vids > 0 ||
    attachments.auds > 0 || attachments.apps > 0 || attachments.links > 0 ||
    (kindMeta && !isKnownKindWithoutPreview)
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
      ) : isKnownKindWithoutPreview && kindMeta ? (
        <div className="flex items-center gap-2 py-1 text-muted-foreground">
          {kindMeta.Icon && <kindMeta.Icon className="size-4 shrink-0" />}
          <span className="text-sm font-medium capitalize">{kindMeta.label}</span>
        </div>
      ) : isUnknownKind ? (
        <p className="text-sm italic text-muted-foreground">
          This event kind is not supported
        </p>
      ) : (
        <EmbedTruncatedContent event={event} expanded={contentExpanded} onOverflowChange={setContentOverflows} highlightText={highlightText} />
      )}

      {/* Attachment / kind indicator chips + Read more toggle */}
      {hasFooter && (
        <div className="flex items-center gap-2 flex-wrap">
          {kindMeta && !isKnownKindWithoutPreview && (
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
function EmbedTruncatedContent({ event, expanded, onOverflowChange, highlightText }: {
  event: NostrEvent;
  expanded: boolean;
  onOverflowChange: (overflows: boolean) => void;
  highlightText?: string;
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
      <NoteContent event={event} className="text-sm leading-relaxed" disableMediaEmbeds disableNoteEmbeds highlightText={highlightText} />
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

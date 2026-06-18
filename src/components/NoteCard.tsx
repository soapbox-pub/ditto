import type { NostrEvent } from "@nostrify/nostrify";
import {
  Award,
  Bird,
  Camera,
  Egg,
  FileCode,
  FileText,
  GitBranch,
  GitPullRequest,
  HandHeart,
  Heart,
  ListMusic,
  Mail,
  MessageCircle,
  Music,
  Quote,
  Rocket,
  MoreHorizontal,
  Package,
  Play,
  Radio,
  SmilePlus,
  PartyPopper,
  Sparkles,
  Stars,
  UserCheck,
  Users,
  Volume2,
  VolumeX,
  Zap,
} from "lucide-react";
import { nip19 } from "nostr-tools";
import { type ReactNode, lazy, memo, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
/** Lazy-loaded markdown-heavy components — keeps react-markdown + unified pipeline out of the main feed bundle. */
const ArticleContent = lazy(() => import("@/components/ArticleContent").then(m => ({ default: m.ArticleContent })));
const BlobbiStateCard = lazy(() => import("@/components/BlobbiStateCard").then(m => ({ default: m.BlobbiStateCard })));
const BlobbiSocialActions = lazy(() => import("@/components/BlobbiSocialActions").then(m => ({ default: m.BlobbiSocialActions })));
import { parseBlobbiEvent } from "@/blobbi/core/lib/blobbi";
import { useInteractionReaction, INVENTORY_TO_REACTION } from '@/blobbi/ui/hooks/useInteractionReaction';
import type { InventoryAction } from '@/blobbi/actions/lib/blobbi-action-utils';
import {
  MusicPlaylistContent,
  MusicTrackContent,
  PodcastEpisodeContent,
  PodcastTrailerContent,
} from "@/components/AudioKindContent";
import { BadgeAwardCard } from "@/components/BadgeAwardCard";
import { BadgeContent } from "@/components/BadgeContent";
import { BadgeSetContent } from "@/components/BadgeSetContent";
import { CalendarEventContent } from "@/components/CalendarEventContent";
import {
  ColorMomentContent,
  ColorMomentEyeButton,
} from "@/components/ColorMomentContent";
import { BrokenEventFallback } from "@/components/BrokenEventFallback";
import { CommentContext } from "@/components/CommentContext";
import { ContentWarningGuard } from "@/components/ContentWarningGuard";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { EmojifiedText, ReactionEmoji } from "@/components/CustomEmoji";
const CustomNipCard = lazy(() => import("@/components/CustomNipCard").then(m => ({ default: m.CustomNipCard })));
import { EmojiPackContent } from "@/components/EmojiPackContent";
import { FileMetadataContent } from "@/components/FileMetadataContent";
import { PeopleListContent } from "@/components/PeopleListContent";
import { PeopleAvatarStack } from "@/components/PeopleAvatarStack";
import { FoundLogContent } from "@/components/FoundLogContent";
import { GeocacheContent } from "@/components/GeocacheContent";
import { BirdDetectionContent } from "@/components/BirdDetectionContent";
import { BirdexContent } from "@/components/BirdexContent";
import { ConstellationContent } from "@/components/ConstellationContent";
import { GitRepoCard } from "@/components/GitRepoCard";
import { HighlightContent } from "@/components/HighlightContent";
import { CampaignContent } from "@/components/CampaignContent";
import { ZapContent } from "@/components/ZapContent";
import { NsiteCard } from "@/components/NsiteCard";
import { ImageGallery } from "@/components/ImageGallery";
import { CardsIcon } from "@/components/icons/CardsIcon";
import { ChestIcon } from "@/components/icons/ChestIcon";
import { RepostIcon } from "@/components/icons/RepostIcon";
import { LiveStreamPlayer } from "@/components/LiveStreamPlayer";
import { MagicDeckContent } from "@/components/MagicDeckContent";
import { Nip05Badge } from "@/components/Nip05Badge";
import { NoteContent } from "@/components/NoteContent";
import { NoteMoreMenu } from "@/components/NoteMoreMenu";
import { PatchCard } from "@/components/PatchCard";
import { PollContent } from "@/components/PollContent";
import { ProfileBadgesContent } from "@/components/ProfileBadgesContent";
import { ProfileCard } from "@/components/ProfileCard";
import { ProfileHoverCard } from "@/components/ProfileHoverCard";
const PullRequestCard = lazy(() => import("@/components/PullRequestCard").then(m => ({ default: m.PullRequestCard })));
import { ReactionButton } from "@/components/ReactionButton";
import { ReplyComposeModal } from "@/components/ReplyComposeModal";
import { ReplyContext } from "@/components/ReplyContext";
import { RepostMenu } from "@/components/RepostMenu";
import { ThemeContent } from "@/components/ThemeContent";
import { UnknownKindContent } from "@/components/UnknownKindContent";
import { EncryptedMessageContent } from "@/components/EncryptedMessageContent";
import { EncryptedLetterContent } from "@/components/EncryptedLetterContent";
import { LoveListContent } from "@/components/LoveListContent";
import { VanishCardCompact } from "@/components/VanishEventContent";
import { ZapstoreAppContent } from "@/components/ZapstoreAppContent";
import { ZapstoreReleaseContent, ZapstoreAssetContent } from "@/components/ZapstoreReleaseContent";
import { AppHandlerContent } from "@/components/AppHandlerContent";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getAvatarShape } from "@/lib/avatarShape";
import { isBadgeSetEvent, isProfileBadgesEvent } from "@/lib/badgeUtils";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { VideoPlayer } from "@/components/VideoPlayer";
import { VoiceMessagePlayer } from "@/components/VoiceMessagePlayer";
import { ZapDialog } from "@/components/ZapDialog";
import { useAppContext } from "@/hooks/useAppContext";
import { useAuthor } from "@/hooks/useAuthor";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useLoveList, LOVE_LIST_KIND } from "@/hooks/useLoveList";
import { useNip05Verify } from "@/hooks/useNip05Verify";
import { useOpenPost } from "@/hooks/useOpenPost";
import { useProfileUrl } from "@/hooks/useProfileUrl";
import { useEventStats } from "@/hooks/useTrending";
import { useFormatMoney } from "@/hooks/useFormatMoney";
import { extractZapMessage } from "@/hooks/useEventInteractions";
import { getZapAmountSats, getZapSenderPubkey } from "@/lib/zapHelpers";
import { extractOnchainZapRecipients } from "@/hooks/useOnchainZaps";
import { getContentWarning } from "@/lib/contentWarning";
import { getDisplayName } from "@/lib/getDisplayName";
import { usePollVoteLabel } from "@/hooks/usePollVoteLabel";
import { getParentEventHints, isReplyEvent } from "@/lib/nostrEvents";
import { isMediaDominantPost } from "@/lib/noteContent";
import { timeAgo } from "@/lib/timeAgo";
import { formatNumber } from "@/lib/formatNumber";
import { publishedAtAction } from "@/lib/publishedAtAction";
import { parseBadgeSet } from "@/lib/parseBadgeSet";
import { getEffectiveStreamStatus } from "@/lib/streamStatus";
import { cn } from "@/lib/utils";
import { encodeEventAddress } from "@/lib/encodeEvent";
import { isVineMuted, setVineMuted } from "@/lib/vineGlobalMute";


/** Profile card for use in feeds (kind 0). */
function ProfileCardContent({ event }: { event: NostrEvent }) {
  let metadata: Record<string, unknown> = {};
  try { metadata = JSON.parse(event.content); } catch { /* ignore */ }
  return (
    <div className="mt-2" onClick={(e) => e.stopPropagation()}>
      <ProfileCard pubkey={event.pubkey} metadata={metadata} showNip05={false} />
    </div>
  );
}

/* ──── Shared activity card shell for reaction / repost / zap / poll vote ──── */

interface ActivityCardProps {
  /** The round element in the left column (icon bubble or avatar). */
  icon: ReactNode;
  /** The actor row content (avatar + name + label + timestamp). */
  actorRow: ReactNode;
  /** Optional extra content below the actor row (zap message, vote label, etc.). */
  children?: ReactNode;
  /** Optional action header rendered above the card body (e.g. "X reposted"). */
  header?: ReactNode;
  /** Threaded mode: connector line below icon, no bottom border. */
  threaded?: boolean;
  /** Last item in thread — no connector line, has bottom border. */
  threadedLast?: boolean;
  /** Custom connector line class. */
  threadedLineClassName?: string;
  className?: string;
  onClick?: React.MouseEventHandler;
  onAuxClick?: React.MouseEventHandler;
}

export function ActivityCard({
  icon,
  actorRow,
  children,
  header,
  threaded,
  threadedLast,
  threadedLineClassName,
  className,
  onClick,
  onAuxClick,
}: ActivityCardProps) {
  const isThreaded = threaded || threadedLast;
  return (
    <article
      className={cn(
        "px-4 hover:bg-secondary/30 transition-colors cursor-pointer overflow-hidden",
        isThreaded
          ? cn("pt-3", threaded ? "pb-0" : "pb-3 border-b border-border")
          : "py-3 border-b border-border",
        className,
      )}
      onClick={onClick}
      onAuxClick={onAuxClick}
    >
      {header}
      <div className="flex gap-3">
        <div className="flex flex-col items-center">
          {icon}
          {threaded && (
            <div className={cn("w-0.5 flex-1 mt-2 rounded-full", threadedLineClassName || "bg-foreground/20")} />
          )}
        </div>
        <div className={cn("flex-1 min-w-0", isThreaded ? "min-h-10 flex flex-col justify-center" : "", threaded && "pb-3")}>
          {actorRow}
          {children}
        </div>
      </div>
    </article>
  );
}

/** Reusable actor row: small avatar + display name + action label + timestamp. */
export interface ActorRowProps {
  pubkey: string;
  profileUrl: string;
  avatarShape: Parameters<typeof Avatar>[0]['shape'];
  picture?: string;
  displayName: string;
  authorEvent?: NostrEvent;
  isLoading?: boolean;
  label: string;
  /** Extra inline elements after the label (e.g. zap amount). */
  extra?: ReactNode;
  /** Formatted timestamp string (e.g. timeAgo or full date). */
  timestampLabel: string;
}

export function ActorRow({ pubkey, profileUrl, avatarShape, picture, displayName, authorEvent, isLoading, label, extra, timestampLabel }: ActorRowProps) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-2">
        <Skeleton className="size-6 rounded-full shrink-0" />
        <Skeleton className="h-3.5 w-20" />
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <ProfileHoverCard pubkey={pubkey} asChild>
        <Link to={profileUrl} className="shrink-0" onClick={(e) => e.stopPropagation()}>
          <Avatar shape={avatarShape} className="size-6">
            <AvatarImage src={picture} alt={displayName} />
            <AvatarFallback className="bg-primary/20 text-primary text-[8px]">{displayName[0]?.toUpperCase()}</AvatarFallback>
          </Avatar>
        </Link>
      </ProfileHoverCard>
      <ProfileHoverCard pubkey={pubkey} asChild>
        <Link to={profileUrl} className="font-semibold text-sm hover:underline truncate" onClick={(e) => e.stopPropagation()}>
          {authorEvent ? <EmojifiedText tags={authorEvent.tags}>{displayName}</EmojifiedText> : displayName}
        </Link>
      </ProfileHoverCard>
      <span className="text-sm text-muted-foreground shrink-0">{label}</span>
      {extra}
      <span className="text-xs text-muted-foreground ml-auto shrink-0">{timestampLabel}</span>
    </div>
  );
}

interface NoteCardProps {
  event: NostrEvent;
  className?: string;
  /** If set, shows a "Reposted by" header with this pubkey. */
  repostedBy?: string;
  /** Optional: the underlying kind 6 / 16 repost event. When provided, the "reposted" verb in the header links to its nevent. */
  repostEvent?: NostrEvent;
  /** If set, shows a "Reacted by" header. The event is the underlying kind 7 reaction (used for linking to its nevent). */
  reactedBy?: { event: NostrEvent; pubkey: string };
  /** If set, shows a "Zapped" header. The event is the underlying kind 9735 / 8333 zap; sats is the parsed amount (0 if unknown). */
  zappedBy?: { event: NostrEvent; pubkey: string; sats: number };
  /**
   * If set, `event` is a profile-targeted zap (kind 9735 or 8333) and
   * this is the recipient pubkey from the `p` tag. Used both when the
   * zap has no `e`/`a` tag (tipping a person, not a note) and as a
   * fallback when the `e`-tagged target note couldn't be resolved on
   * the user's relays — either way the user sees the zap activity as
   * a standalone card rather than losing it. Rendered with the
   * recipient's author header (avatar + name + nip05 + timestamp)
   * under an "X zapped — Y sats" `EventActionHeader`, plus the standard
   * action bar wired to the recipient's kind-0 identity event.
   */
  profileZapRecipient?: string;
  /** If true, hide action buttons (used for embeds). */
  compact?: boolean;
  /** If true, render in threaded ancestor style: connector line below avatar, no bottom border. */
  threaded?: boolean;
  /** Custom class for the threaded connector line (overrides the default color). */
  threadedLineClassName?: string;
  /** Like threaded but without the connector line — used for the last item in a thread (e.g. sub-reply hint). */
  threadedLast?: boolean;
  /** If true, briefly highlight this card (e.g. newly loaded post). */
  highlight?: boolean;
  /** If true, suppress the kind-derived action header (e.g. "created a badge"). Used when the parent already provides context. */
  hideKindHeader?: boolean;
}

/** Gets a tag value by name. */
function getTag(tags: string[][], name: string): string | undefined {
  return tags.find(([n]) => n === name)?.[1];
}

/** Returns true if the click target is inside an interactive overlay/element. */
function isInteractiveTarget(e: React.MouseEvent): boolean {
  const target = e.target as HTMLElement;
  return !!(
    target.closest('[role="dialog"]') ||
    target.closest("[data-radix-dialog-overlay]") ||
    target.closest("[data-radix-dialog-content]") ||
    target.closest("[data-vaul-drawer]") ||
    target.closest("[data-vaul-drawer-overlay]") ||
    target.closest('[data-testid="zap-modal"]') ||
    // Radix popper-based content (dropdowns, popovers, selects, tooltips) renders
    // in a portal as a sibling of the card/dialog, so the click target isn't a DOM
    // descendant of the dialog. Match it explicitly so selecting a menu item (e.g.
    // a payment-method switcher option) doesn't bubble out and navigate to the post.
    target.closest("[data-radix-popper-content-wrapper]") ||
    target.closest('[role="menu"]') ||
    target.closest('[role="menuitem"]') ||
    target.closest("button") ||
    target.closest("a")
  );
}

/** d-tags reserved by NIP-51 for other purposes — hide these kind 30000 events. */
const DEPRECATED_DTAGS = new Set(["mute", "pin", "bookmark", "communities"]);

/** Returns true if a kind 30000 event is a deprecated/junk list that should be hidden. */
function isDeprecatedFollowSet(event: NostrEvent): boolean {
  if (event.kind !== 30000) return false;
  const dTag = event.tags.find(([n]) => n === "d")?.[1] ?? "";
  if (DEPRECATED_DTAGS.has(dTag)) return true;
  // Filter empty lists with no p-tags or title
  const hasPTags = event.tags.some(([n]) => n === "p");
  const hasTitle = event.tags.some(([n]) => n === "title" || n === "name");
  if (!hasPTags && !hasTitle) return true;
  return false;
}

export const NoteCard = memo(function NoteCard({
  event,
  className,
  repostedBy,
  repostEvent,
  reactedBy,
  zappedBy,
  profileZapRecipient,
  compact,
  threaded,
  threadedLineClassName,
  threadedLast,
  highlight,
  hideKindHeader,
}: NoteCardProps) {
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const author = useAuthor(event.pubkey);
  // Love List membership — shows a small heart next to loved authors' names.
  const { isLoved } = useLoveList();
  const authorIsLoved = isLoved(event.pubkey);
  // Sender of a zap event (kind 9735 or 8333). `getZapSenderPubkey` handles
  // both kinds — kind 9735 reads the P tag / description.pubkey because the
  // receipt is signed by the LNURL server, kind 8333 returns `event.pubkey`
  // directly because the sender authors the on-chain attestation. Returns
  // `''` only when the event isn't a zap or the sender can't be resolved.
  const zapSenderPubkey = useMemo(
    () => (event.kind === 9735 || event.kind === 8333 ? getZapSenderPubkey(event) : ''),
    [event],
  );
  const zapSender = useAuthor(zapSenderPubkey || undefined);
  const zapSenderMeta = zapSender.data?.metadata;
  const zapSenderShape = getAvatarShape(zapSenderMeta);
  const zapSenderName = getDisplayName(zapSenderMeta, zapSenderPubkey);
  const zapSenderUrl = useProfileUrl(zapSenderPubkey, zapSenderMeta);

  // Recipient of a profile-targeted zap (kind 8333 / 9735 with `p` tag but
  // no `e` tag). Hooks are called unconditionally with `undefined` when not
  // applicable so the order stays stable across renders.
  const recipient = useAuthor(profileZapRecipient || undefined);
  const recipientMeta = recipient.data?.metadata;
  const recipientShape = getAvatarShape(recipientMeta);
  const recipientName = getDisplayName(recipientMeta, profileZapRecipient ?? "");
  const recipientUrl = useProfileUrl(profileZapRecipient ?? "", recipientMeta);
  const recipientNip05 = recipientMeta?.nip05;
  const { data: recipientNip05Verified, isPending: recipientNip05Pending } = useNip05Verify(
    recipientNip05,
    profileZapRecipient,
  );

  const pollVoteLabel = usePollVoteLabel(event);

  const metadata = author.data?.metadata;
  const avatarShape = getAvatarShape(metadata);
  const displayName = getDisplayName(metadata, event.pubkey);
  const nip05 = metadata?.nip05;
  const { data: nip05Verified, isPending: nip05Pending } = useNip05Verify(
    nip05,
    event.pubkey,
  );
  const profileUrl = useProfileUrl(event.pubkey, metadata);
  const encodedId = useMemo(() => encodeEventAddress(event), [event]);
  const { data: stats } = useEventStats(event.id, event);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);
  // Separate modal state for the profile-zap action bar, which targets the
  // recipient's kind-0 profile event rather than the zap event itself.
  const [recipientMoreMenuOpen, setRecipientMoreMenuOpen] = useState(false);
  const [recipientReplyOpen, setRecipientReplyOpen] = useState(false);

  // Blobbi interaction reaction — triggers visual feedback on the card when social action succeeds
  const { state: blobbiReactionState, trigger: triggerBlobbiReaction } = useInteractionReaction();
  const handleBlobbiInteractionSuccess = useCallback((action: InventoryAction) => {
    const mapped = INVENTORY_TO_REACTION[action];
    if (mapped) triggerBlobbiReaction(mapped);
  }, [triggerBlobbiReaction]);

  // Zap button shows for any logged-in user except on their own posts.
  // On-chain zaps are always available; Lightning is offered inside the dialog
  // when the author has lud06/lud16.
  const canZapAuthor = !!user && user.pubkey !== event.pubkey;

  // Profile-zap variants: when the card targets a recipient profile rather
  // than a specific note, the action bar attaches to the recipient's kind-0
  // event so reply/repost/react/zap operate on that identity event. Hooks
  // run unconditionally with `undefined` when not applicable.
  const recipientEvent = recipient.data?.event;
  const { data: recipientStats } = useEventStats(recipientEvent?.id, recipientEvent);
  const canZapRecipient = !!user && !!profileZapRecipient && user.pubkey !== profileZapRecipient;

  // Money formatter (USD by default, with sats fallback). Reused for the
  // "X zapped Y" wrapper header and the kind 9735 zap-receipt card below.
  const { format: formatMoney } = useFormatMoney();

  const { onClick: openPost, onAuxClick: auxOpenPost } = useOpenPost(
    `/${encodedId}`,
  );

  // Profile-zap card click target: the recipient's profile, not the zap event.
  const { onClick: openRecipient, onAuxClick: auxOpenRecipient } = useOpenPost(
    recipientUrl || `/${encodedId}`,
  );

  // Handler to navigate to post detail, but only if click didn't originate from a modal
  const handleCardClick = (e: React.MouseEvent) => {
    if (isInteractiveTarget(e)) return;
    openPost();
  };

  const handleAuxClick = (e: React.MouseEvent) => {
    if (isInteractiveTarget(e)) return;
    auxOpenPost(e);
  };

  const isVine = event.kind === 34236 || event.kind === 22;
  const isPoll = event.kind === 1068;
  const isGeocache = event.kind === 37516;
  const isFoundLog = event.kind === 7516;
  const isColor = event.kind === 3367;
  const isBirdDetection = event.kind === 2473;
  const isBirdex = event.kind === 12473;
  const isConstellation = event.kind === 30621;
  const isPeopleList = event.kind === 3 || event.kind === 30000 || event.kind === 39089;
  const isArticle = event.kind === 30023;
  const isMagicDeck = event.kind === 37381;
  const isStream = event.kind === 30311;
  const isFileMetadata = event.kind === 1063;
  const isThemeDefinition = event.kind === 36767;
  const isActiveTheme = event.kind === 16767;
  const isTheme = isThemeDefinition || isActiveTheme;
  const isVoiceMessage = event.kind === 1222 || event.kind === 1244;
  const isCalendarEvent = event.kind === 31922 || event.kind === 31923;
  const isEmojiPack = event.kind === 30030;
  const isBadgeDefinition = event.kind === 30009;
  const isProfileBadges = isProfileBadgesEvent(event);
  const isBadgeSet = isBadgeSetEvent(event);
  const isBadgeAward = event.kind === 8;
  const isBadge = isBadgeDefinition || isProfileBadges || isBadgeSet || isBadgeAward;
  const isReaction = event.kind === 7;
  const isPollVote = event.kind === 1018;
  const isRepost = event.kind === 6 || event.kind === 16;
  const isPhoto = event.kind === 20;
  const isVideo = event.kind === 21;
  const isMusicTrack = event.kind === 36787;
  const isMusicPlaylist = event.kind === 34139;
  const isPodcastEpisode = event.kind === 30054;
  const isPodcastTrailer = event.kind === 30055;
  const isAudioKind =
    isMusicTrack || isMusicPlaylist || isPodcastEpisode || isPodcastTrailer;
  const isGitRepo = event.kind === 30617;
  const isPatch = event.kind === 1617;
  const isPullRequest = event.kind === 1618;
  const isCustomNip = event.kind === 30817;
  const isNsite = event.kind === 15128 || event.kind === 35128;
  const isZapstoreApp = event.kind === 32267;
  const isZapstoreRelease = event.kind === 30063;
  const isZapstoreAsset = event.kind === 3063;
  const isAppHandler = event.kind === 31990;
  const isEncryptedDM = event.kind === 4;
  const isLetter = event.kind === 8211;
  const isLoveList = event.kind === LOVE_LIST_KIND;
  const isHighlight = event.kind === 9802;
  const isCampaign = event.kind === 33863;
  const isVanish = event.kind === 62;
  const isZap = event.kind === 9735 || event.kind === 8333;
  // Multi-recipient onchain zap (NIP-BC batch form): more than one `p` tag.
  // Renders as a standalone zap activity card with an avatar stack instead
  // of the single-recipient "headline" layout where one recipient takes the
  // place of the post author.
  const isMultiRecipientOnchainZap = useMemo(
    () => event.kind === 8333 && extractOnchainZapRecipients(event).length > 1,
    [event],
  );
  const isProfile = event.kind === 0;
  const isBlobbiState = event.kind === 31124;
  const blobbiCompanion = useMemo(() => isBlobbiState ? parseBlobbiEvent(event) : null, [event, isBlobbiState]);
  const showBlobbiInteract = isBlobbiState
    && !!user
    && user.pubkey !== event.pubkey
    && !!blobbiCompanion?.socialOpen
    && blobbiCompanion?.stage !== 'egg';
  const isDevKind = isGitRepo || isPatch || isPullRequest || isCustomNip || isNsite;
  const isTextNote =
    !isVine &&
    !isPoll &&
    !isGeocache &&
    !isFoundLog &&
    !isColor &&
    !isBirdDetection &&
    !isBirdex &&
    !isConstellation &&
    !isPeopleList &&
    !isArticle &&
    !isMagicDeck &&
    !isStream &&
    !isFileMetadata &&
    !isTheme &&
    !isVoiceMessage &&
    !isCalendarEvent &&
    !isEmojiPack &&
    !isBadge &&
    !isReaction &&
    !isPollVote &&
    !isRepost &&
    !isPhoto &&
    !isVideo &&
    !isAudioKind &&
    !isDevKind &&
    !isZapstoreApp &&
    !isZapstoreRelease &&
    !isZapstoreAsset &&
    !isAppHandler &&
    !isEncryptedDM &&
    !isLetter &&
    !isLoveList &&
    !isHighlight &&
    !isCampaign &&
    !isVanish &&
    !isZap &&
    !isProfile &&
    !isBlobbiState;

  const isComment = event.kind === 1111;
  const isReply = isTextNote && !isComment && isReplyEvent(event);
  // Unknown kinds land in the `isTextNote` branch (it's the negation of every
  // known-kind flag above). For anything other than real text-note kinds
  // (1 / 11 / 1111), render a NIP-31 fallback instead of feeding arbitrary
  // content into the kind-1 tokenizer.
  const isUnknownKind =
    isTextNote && event.kind !== 1 && event.kind !== 11 && event.kind !== 1111;

  // Find all people being replied to (for "Replying to @user1 and @user2")
  const replyToPubkeys = useMemo(() => {
    if (!isTextNote || !isReply) return [];

    // Get all p tags that aren't marked as mentions
    const pTags = event.tags.filter(
      ([name, , , marker]) => name === "p" && marker !== "mention",
    );

    if (pTags.length > 0) {
      // Remove duplicates and filter out undefined/empty pubkeys
      return [
        ...new Set(pTags.map(([, pubkey]) => pubkey).filter(Boolean)),
      ] as string[];
    }

    // Fallback: if all p tags are mentions, use all p tags anyway
    const allPTags = event.tags.filter(([name]) => name === "p");
    if (allPTags.length > 0) {
      return [
        ...new Set(allPTags.map(([, pubkey]) => pubkey).filter(Boolean)),
      ] as string[];
    }

    // Self-reply fallback: when replying to own post, no p tags are added (the
    // author's own pubkey is excluded during compose). Try to extract the parent
    // author from the reply/root e-tag's 5th element (NIP-10 pubkey hint), and
    // ultimately fall back to the event author (self-reply).
    const eTags = event.tags.filter(
      ([name, , , marker]) => name === "e" && marker !== "mention",
    );
    const replyTag = eTags.find(([, , , marker]) => marker === "reply");
    const rootTag = eTags.find(([, , , marker]) => marker === "root");
    const parentAuthor = replyTag?.[4] || rootTag?.[4] || event.pubkey;
    return [parentAuthor];
  }, [event.tags, isTextNote, isReply, event.pubkey]);

  // Extract the parent event ID + relay/author hints for reply hover card preview
  const parentHints = useMemo(() => {
    if (!isReply) return undefined;
    return getParentEventHints(event);
  }, [event, isReply]);
  const parentEventId = parentHints?.id;

  // Kind 22 / 34236 specific
  const imeta = useMemo(
    () => (isVine ? parseVideoImeta(event.tags) : undefined),
    [event.tags, isVine],
  );
  const vineTitle = isVine ? getTag(event.tags, "title") : undefined;
  const hashtags = isVine
    ? event.tags.filter(([n]) => n === "t").map(([, v]) => v)
    : [];

  // Filter out deprecated/junk kind 30000 events
  if (isDeprecatedFollowSet(event)) {
    return null;
  }

  // NIP-36: If the event has a content-warning and the policy is "hide", skip rendering entirely
  if (
    getContentWarning(event) !== undefined &&
    config.contentWarningPolicy === "hide"
  ) {
    return null;
  }

  // Hide magic decks tagged t:unlisted and treasures tagged t:hidden
  if (
    isMagicDeck &&
    event.tags.some(([n, v]) => n === "t" && v === "unlisted")
  ) {
    return null;
  }
  if (isGeocache && event.tags.some(([n, v]) => n === "t" && v === "hidden")) {
    return null;
  }

  // Shared content block used in both normal and threaded layouts
  const contentBlock = (
    <>
      {/* Reply context (kind 1) or comment context (kind 1111) — shown above content */}
      {isComment && <CommentContext event={event} />}
      {isReply && (
        <ReplyContext
          pubkeys={replyToPubkeys}
          parentEventId={parentEventId}
          parentRelayHint={parentHints?.relayHint}
          parentAuthorHint={parentHints?.authorHint}
        />
      )}

      {/* Content — kind-based dispatch, guarded by NIP-36 content-warning */}
      <ErrorBoundary
        fallback={<BrokenEventFallback />}
        sentryLevel="error"
        sentryTags={{ errorBoundary: 'note-card', kind: event.kind }}
        resetKeys={[event.id]}
      >
        <ContentWarningGuard event={event}>
        {isPhoto ? (
          <PhotoContent event={event} />
        ) : isVideo ? (
          <VideoContent event={event} />
        ) : isVine ? (
          <>
            {vineTitle && (
              <p className="text-[15px] mt-2 leading-relaxed break-words overflow-hidden">
                {vineTitle}
              </p>
            )}
            <VineMedia imeta={imeta} hashtags={hashtags} />
          </>
        ) : isPoll ? (
          <PollContent event={event} />
        ) : isGeocache ? (
          <GeocacheContent event={event} />
        ) : isFoundLog ? (
          <FoundLogContent event={event} />
        ) : isColor ? (
          <ColorMomentContent event={event} />
        ) : isBirdDetection ? (
          <BirdDetectionContent event={event} />
        ) : isBirdex ? (
          <BirdexContent event={event} />
        ) : isConstellation ? (
          <ConstellationContent event={event} />
        ) : isPeopleList ? (
          <PeopleListContent event={event} />
        ) : isArticle ? (
          <Suspense fallback={<Skeleton className="h-24 w-full rounded-lg" />}>
            <ArticleContent event={event} preview className="mt-2" />
          </Suspense>
        ) : isMagicDeck ? (
          <MagicDeckContent event={event} />
        ) : isStream ? (
          <StreamContent event={event} />
        ) : isFileMetadata ? (
          <FileMetadataContent event={event} compact />
        ) : isEmojiPack ? (
          <EmojiPackContent event={event} />
        ) : isBadgeDefinition ? (
          <BadgeContent event={event} />
        ) : isBadgeSet ? (
          <BadgeSetContent event={event} />
        ) : isProfileBadges ? (
          <ProfileBadgesContent event={event} />
        ) : isBadgeAward ? (
          <BadgeAwardCard event={event} />
        ) : isTheme ? (
          <ThemeContent event={event} />
        ) : isVoiceMessage ? (
          <VoiceMessagePlayer event={event} />
        ) : isCalendarEvent ? (
          <CalendarEventContent event={event} compact />
        ) : isMusicTrack ? (
          <MusicTrackContent event={event} />
        ) : isMusicPlaylist ? (
          <MusicPlaylistContent event={event} />
        ) : isPodcastEpisode ? (
          <PodcastEpisodeContent event={event} />
        ) : isPodcastTrailer ? (
          <PodcastTrailerContent event={event} />
        ) : isGitRepo ? (
          <GitRepoCard event={event} />
        ) : isPatch ? (
          <PatchCard event={event} />
        ) : isPullRequest ? (
          <Suspense fallback={<Skeleton className="h-24 w-full rounded-lg" />}>
            <PullRequestCard event={event} />
          </Suspense>
        ) : isCustomNip ? (
          <Suspense fallback={<Skeleton className="h-24 w-full rounded-lg" />}>
            <CustomNipCard event={event} />
          </Suspense>
        ) : isNsite ? (
          <NsiteCard event={event} />
        ) : isZapstoreApp ? (
          <div className="mt-2 rounded-xl border border-border overflow-hidden transition-all duration-300 hover:shadow-md hover:border-primary/20">
            <div className="px-3.5 pb-3.5 pt-3">
              <ZapstoreAppContent event={event} compact />
            </div>
          </div>
        ) : isZapstoreRelease ? (
          <div className="mt-2 rounded-xl border border-border overflow-hidden transition-all duration-300 hover:shadow-md hover:border-primary/20">
            <div className="px-3.5 pb-3.5 pt-3">
              <ZapstoreReleaseContent event={event} compact />
            </div>
          </div>
        ) : isZapstoreAsset ? (
          <div className="mt-2 rounded-xl border border-border overflow-hidden transition-all duration-300 hover:shadow-md hover:border-primary/20">
            <div className="px-3.5 pb-3.5 pt-3">
              <ZapstoreAssetContent event={event} compact />
            </div>
          </div>
        ) : isAppHandler ? (
          <AppHandlerContent event={event} compact />
        ) : isEncryptedDM ? (
          <EncryptedMessageContent event={event} compact />
        ) : isLetter ? (
          <EncryptedLetterContent event={event} compact />
        ) : isLoveList ? (
          <LoveListContent event={event} compact />
        ) : isHighlight ? (
          <HighlightContent event={event} />
        ) : isCampaign ? (
          <CampaignContent event={event} />
        ) : isProfile ? (
          <ProfileCardContent event={event} />
        ) : isBlobbiState ? (
          <Suspense fallback={<Skeleton className="h-24 w-full rounded-lg" />}>
            <BlobbiStateCard event={event} lookMode="follow-pointer" interactionReaction={blobbiReactionState} />
          </Suspense>
        ) : isZap ? (
          <ZapContent event={event} recipientPubkey={profileZapRecipient} />
        ) : isUnknownKind ? (
          <UnknownKindContent event={event} />
        ) : (
          <TruncatedNoteContent
            event={event}
          />
        )}
      </ContentWarningGuard>
      </ErrorBoundary>
    </>
  );

  // Shared author info block — min-h-[42px] keeps the container the same height
  // whether the skeleton or the resolved profile is rendered, preventing layout shifts.
  const authorInfo = author.isLoading ? (
    <div className="min-w-0 min-h-[42px] flex flex-col justify-center space-y-1.5">
      <Skeleton className="h-4 w-28" />
      <Skeleton className="h-3 w-36" />
    </div>
  ) : (
    <div className="min-w-0 flex-1 min-h-[42px] flex flex-col justify-center">
      <div className="flex items-center gap-1.5">
        <ProfileHoverCard pubkey={event.pubkey} asChild>
          <Link
            to={profileUrl}
            className="font-bold text-[15px] hover:underline truncate"
            onClick={(e) => e.stopPropagation()}
          >
            {author.data?.event ? (
              <EmojifiedText tags={author.data.event.tags}>
                {displayName}
              </EmojifiedText>
            ) : (
              displayName
            )}
          </Link>
        </ProfileHoverCard>
        {authorIsLoved && (
          <Heart
            className="size-3.5 shrink-0 text-red-500 fill-red-500"
            aria-label="On your Love List"
            role="img"
          />
        )}
        {metadata?.bot && (
          <span className="text-xs text-primary shrink-0" title="Bot account">
            🤖
          </span>
        )}
      </div>
      <div className="flex items-center gap-1 text-sm text-muted-foreground min-w-0 pr-2">
        {nip05 && nip05Pending && <Skeleton className="h-3 w-24" />}
        {nip05 && nip05Pending && <span className="shrink-0">·</span>}
        {nip05 && nip05Verified && (
          <Nip05Badge nip05={nip05} pubkey={event.pubkey} />
        )}
        {nip05 && nip05Verified && <span className="shrink-0">·</span>}
        <span className="shrink-0 hover:underline whitespace-nowrap">
          {timeAgo(event.created_at)}
        </span>
      </div>
    </div>
  );

  // Shared avatar element
  const avatarElement = author.isLoading ? (
    <Skeleton
      className={cn(
        threaded || threadedLast ? "size-10" : "size-11",
        "rounded-full shrink-0",
      )}
    />
  ) : (
    <ProfileHoverCard pubkey={event.pubkey} asChild>
      <Link
        to={profileUrl}
        className="shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <Avatar shape={avatarShape} className={threaded || threadedLast ? "size-10" : "size-11"}>
          <AvatarImage src={metadata?.picture} alt={displayName} />
          <AvatarFallback className="bg-primary/20 text-primary text-sm">
            {displayName[0]?.toUpperCase()}
          </AvatarFallback>
        </Avatar>
      </Link>
    </ProfileHoverCard>
  );

  // ── Shared action buttons (used in all layouts) ──
  // Most cards bind the bar to `event`. Profile-zap cards bind it to the
  // recipient's kind-0 profile event instead, so reply/repost/react/zap
  // operate on the identity event the zap actually targeted.
  const renderActionButtons = (opts?: {
    target?: NostrEvent;
    targetStats?: typeof stats;
    canZap?: boolean;
    onReply?: () => void;
    onMore?: () => void;
  }) => {
    const t = opts?.target ?? event;
    const s = opts?.targetStats ?? stats;
    const cz = opts?.canZap ?? canZapAuthor;
    const reply = opts?.onReply ?? (() => setReplyOpen(true));
    const more = opts?.onMore ?? (() => setMoreMenuOpen(true));
    return (
      <div className={cn("flex items-center mt-3 -ml-2", showBlobbiInteract ? "gap-4 sm:gap-5" : "gap-5")}>
        <button
          type="button"
          className={cn("flex items-center gap-1.5 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors", showBlobbiInteract ? "p-1.5 sm:p-2" : "p-2")}
          title="Reply"
          onClick={(e) => {
            e.stopPropagation();
            reply();
          }}
        >
          <MessageCircle className={showBlobbiInteract ? "size-[18px] sm:size-5" : "size-5"} />
          {s?.replies ? (
            <span className="text-sm tabular-nums">{formatNumber(s.replies)}</span>
          ) : null}
        </button>

        <RepostMenu event={t}>
          {(isReposted: boolean) => (
            <button
              type="button"
              className={cn(`flex items-center gap-1.5 rounded-full transition-colors ${isReposted ? "text-accent hover:text-accent/80 hover:bg-accent/10" : "text-muted-foreground hover:text-accent hover:bg-accent/10"}`, showBlobbiInteract ? "p-1.5 sm:p-2" : "p-2")}
              title={isReposted ? "Undo repost" : "Repost"}
            >
              <RepostIcon className={showBlobbiInteract ? "size-[18px] sm:size-5" : "size-5"} />
              {s?.reposts || s?.quotes ? (
                <span className="text-sm tabular-nums">
                  {formatNumber((s?.reposts ?? 0) + (s?.quotes ?? 0))}
                </span>
              ) : null}
            </button>
          )}
        </RepostMenu>

        <ReactionButton
          eventId={t.id}
          eventPubkey={t.pubkey}
          eventKind={t.kind}
          reactedEvent={t}
          reactionCount={s?.reactions}
        />

        {showBlobbiInteract && (
          <Suspense fallback={null}>
            <BlobbiSocialActions event={t} source="blobbi-feed" companion={blobbiCompanion} onInteractionSuccess={handleBlobbiInteractionSuccess} />
          </Suspense>
        )}

        {cz && (
          <ZapDialog target={t}>
            <button
              type="button"
              className={cn(
                "flex items-center gap-1.5 rounded-full transition-colors",
                "text-muted-foreground hover:text-amber-500 hover:bg-amber-500/10",
                showBlobbiInteract ? "p-1.5 sm:p-2" : "p-2",
              )}
              title="Zap"
            >
              <Zap
                className={showBlobbiInteract ? "size-[18px] sm:size-5" : "size-5"}
                fill="none"
              />
              {s?.zapAmount ? (
                <span className="text-sm tabular-nums">
                  {formatMoney(s.zapAmount, { layout: 'compact' })}
                </span>
              ) : null}
            </button>
          </ZapDialog>
        )}

        <button
          type="button"
          className={cn("rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors", showBlobbiInteract ? "p-1.5 sm:p-2" : "p-2")}
          title="More"
          onClick={(e) => {
            e.stopPropagation();
            more();
          }}
        >
          <MoreHorizontal className={showBlobbiInteract ? "size-[18px] sm:size-5" : "size-5"} />
        </button>
      </div>
    );
  };

  const actionButtons = renderActionButtons();

  // ── Vanish layout (kind 62) — dramatic card, no author row ──
  if (isVanish) {
    // Threaded vanish (ancestor in a reply thread — needs connector line + avatar column)
    if (threaded || threadedLast) {
      return (
        <article
          className={cn(
            "px-4 pt-3 hover:bg-secondary/30 transition-colors cursor-pointer overflow-hidden",
            threaded ? "pb-0" : "pb-3 border-b border-border",
            className,
          )}
          onClick={handleCardClick}
          onAuxClick={handleAuxClick}
        >
          <div className="flex gap-3">
            <div className="flex flex-col items-center">
              {avatarElement}
              {threaded && (
                <div className={cn("w-0.5 flex-1 mt-2 rounded-full", threadedLineClassName || "bg-foreground/20")} />
              )}
            </div>
            <div className={cn("flex-1 min-w-0", threaded && "pb-3")}>
              <VanishCardCompact event={event} timestamp={timeAgo(event.created_at)} />
              {!compact && (
                <>
                  {actionButtons}
                  <NoteMoreMenu event={event} open={moreMenuOpen} onOpenChange={setMoreMenuOpen} />
                  <ReplyComposeModal event={event} open={replyOpen} onOpenChange={setReplyOpen} />
                </>
              )}
            </div>
          </div>
        </article>
      );
    }

    return (
      <article
        className={cn(
          "px-4 py-3 border-b border-border hover:bg-secondary/30 transition-colors cursor-pointer overflow-hidden",
          className,
        )}
        onClick={handleCardClick}
        onAuxClick={handleAuxClick}
      >
        <VanishCardCompact event={event} />
        {!compact && (
          <>
            {actionButtons}
            <NoteMoreMenu
              event={event}
              open={moreMenuOpen}
              onOpenChange={setMoreMenuOpen}
            />
            <ReplyComposeModal
              event={event}
              open={replyOpen}
              onOpenChange={setReplyOpen}
            />
          </>
        )}
      </article>
    );
  }

  // Wrapper header — shown above activity-card layouts (reaction/repost/zap/poll vote)
  // and above the normal layout when this event was surfaced via a repost,
  // reaction, or zap. The activity-card branches return early so they need
  // it computed up here.
  const wrapperHeader = reactedBy ? (
    <EventActionHeader
      pubkey={reactedBy.pubkey}
      icon={SmilePlus}
      iconNode={
        <span className="size-4 translate-y-px flex items-center justify-center leading-none">
          <ReactionEmoji
            content={reactedBy.event.content}
            tags={reactedBy.event.tags}
            className="inline-block h-4 w-4 object-contain"
          />
        </span>
      }
      action="reacted to"
      actionEvent={reactedBy.event}
    />
  ) : zappedBy ? (
    <EventActionHeader
      pubkey={zappedBy.pubkey}
      icon={Zap}
      iconClassName="text-amber-500"
      action="zapped"
      actionEvent={zappedBy.event}
      extra={zappedBy.sats > 0 ? (
        <span className="font-semibold text-amber-500">
          {formatMoney(zappedBy.sats)}
        </span>
      ) : undefined}
    />
  ) : repostedBy ? (
    <EventActionHeader
      pubkey={repostedBy}
      icon={RepostIcon}
      iconClassName="text-accent"
      action="reposted"
      actionEvent={repostEvent}
    />
  ) : undefined;

  // ── Profile-targeted zap layout (kind 8333 / 9735) ──
  // Used when the zap has no resolvable target note — either because
  // it tips a profile directly (no `e` tag) or because the e-tagged
  // target note couldn't be fetched from the user's relays. Either
  // way there's no underlying content to render. We mirror the
  // e-tagged zap layout: the `EventActionHeader` ("X zapped — Y
  // sats") sits on top (the verb itself links to the zap event),
  // then the recipient's author header (avatar + display name +
  // nip05 + timestamp) takes the place of the would-be target note's
  // author block, with the standard action bar attached to the
  // recipient's kind-0 event below. Clicking the card navigates to
  // the recipient's profile.
  if (isZap && profileZapRecipient && !isMultiRecipientOnchainZap) {
    const zapSats = getZapAmountSats(event);
    // Kind 8333: event.pubkey is the sender. Kind 9735: P tag / description.pubkey.
    const senderPubkey = event.kind === 8333 ? event.pubkey : (zapSenderPubkey || event.pubkey);
    const onRecipientClick = (e: React.MouseEvent) => {
      if (isInteractiveTarget(e)) return;
      openRecipient();
    };
    const onRecipientAuxClick = (e: React.MouseEvent) => {
      if (isInteractiveTarget(e)) return;
      auxOpenRecipient(e);
    };
    return (
      <article
        className={cn(
          "px-4 py-3 border-b border-border hover:bg-secondary/30 transition-colors cursor-pointer overflow-hidden",
          highlight && "animate-highlight-fade",
          className,
        )}
        onClick={onRecipientClick}
        onAuxClick={onRecipientAuxClick}
      >
        <EventActionHeader
          pubkey={senderPubkey}
          icon={Zap}
          iconClassName="text-amber-500"
          action="zapped"
          actionEvent={event}
          extra={zapSats > 0 ? (
            <span className="font-semibold text-amber-500">
              {formatMoney(zapSats)}
            </span>
          ) : undefined}
        />
        {/* Recipient's profile header — matches the normal kind-1 author block. */}
        <div className="flex items-center gap-3">
          {recipient.isLoading ? (
            <Skeleton className="size-11 rounded-full shrink-0" />
          ) : (
            <ProfileHoverCard pubkey={profileZapRecipient} asChild>
              <Link
                to={recipientUrl}
                className="shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
                <Avatar shape={recipientShape} className="size-11">
                  <AvatarImage src={recipientMeta?.picture} alt={recipientName} />
                  <AvatarFallback className="bg-primary/20 text-primary text-sm">
                    {recipientName[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </Link>
            </ProfileHoverCard>
          )}
          {recipient.isLoading ? (
            <div className="min-w-0 min-h-[42px] flex flex-col justify-center space-y-1.5">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-36" />
            </div>
          ) : (
            <div className="min-w-0 flex-1 min-h-[42px] flex flex-col justify-center">
              <div className="flex items-center gap-1.5">
                <ProfileHoverCard pubkey={profileZapRecipient} asChild>
                  <Link
                    to={recipientUrl}
                    className="font-bold text-[15px] hover:underline truncate"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {recipient.data?.event ? (
                      <EmojifiedText tags={recipient.data.event.tags}>
                        {recipientName}
                      </EmojifiedText>
                    ) : (
                      recipientName
                    )}
                  </Link>
                </ProfileHoverCard>
                {recipientMeta?.bot && (
                  <span className="text-xs text-primary shrink-0" title="Bot account">
                    🤖
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1 text-sm text-muted-foreground min-w-0 pr-2">
                {recipientNip05 && recipientNip05Pending && <Skeleton className="h-3 w-24" />}
                {recipientNip05 && recipientNip05Pending && <span className="shrink-0">·</span>}
                {recipientNip05 && recipientNip05Verified && (
                  <Nip05Badge nip05={recipientNip05} pubkey={profileZapRecipient} />
                )}
                {recipientNip05 && recipientNip05Verified && <span className="shrink-0">·</span>}
                <span className="shrink-0 hover:underline whitespace-nowrap">
                  {timeAgo(event.created_at)}
                </span>
              </div>
            </div>
          )}
        </div>
        {!compact && recipientEvent && (
          <>
            {renderActionButtons({
              target: recipientEvent,
              targetStats: recipientStats,
              canZap: canZapRecipient,
              onReply: () => setRecipientReplyOpen(true),
              onMore: () => setRecipientMoreMenuOpen(true),
            })}
            <NoteMoreMenu
              event={recipientEvent}
              open={recipientMoreMenuOpen}
              onOpenChange={setRecipientMoreMenuOpen}
            />
            <ReplyComposeModal
              event={recipientEvent}
              open={recipientReplyOpen}
              onOpenChange={setRecipientReplyOpen}
            />
          </>
        )}
      </article>
    );
  }

  // ── Reaction layout (kind 7) ──
  if (isReaction) {
    const iconSize = threaded || threadedLast ? "size-10" : "size-11";
    return (
      <ActivityCard
        header={wrapperHeader}
        icon={
          <div className={cn("flex items-center justify-center rounded-full bg-pink-500/10 shrink-0 text-lg leading-none", iconSize)}>
            <ReactionEmoji content={event.content} tags={event.tags} className="h-5 w-5 object-contain" />
          </div>
        }
        actorRow={
          <ActorRow pubkey={event.pubkey} profileUrl={profileUrl} avatarShape={avatarShape} picture={metadata?.picture}
            displayName={displayName} authorEvent={author.data?.event} isLoading={author.isLoading} label="reacted" timestampLabel={timeAgo(event.created_at)} />
        }
        threaded={threaded} threadedLast={threadedLast} threadedLineClassName={threadedLineClassName}
        className={className} onClick={handleCardClick} onAuxClick={handleAuxClick}
      />
    );
  }

  // ── Repost layout (kind 6 / 16) ──
  if (isRepost) {
    const iconSize = threaded || threadedLast ? "size-10" : "size-11";
    return (
      <ActivityCard
        header={wrapperHeader}
        icon={
          <div className={cn("flex items-center justify-center rounded-full bg-accent/10 shrink-0", iconSize)}>
            <RepostIcon className="size-5 text-accent" />
          </div>
        }
        actorRow={
          <ActorRow pubkey={event.pubkey} profileUrl={profileUrl} avatarShape={avatarShape} picture={metadata?.picture}
            displayName={displayName} authorEvent={author.data?.event} isLoading={author.isLoading} label="reposted" timestampLabel={timeAgo(event.created_at)} />
        }
        threaded={threaded} threadedLast={threadedLast} threadedLineClassName={threadedLineClassName}
        className={className} onClick={handleCardClick} onAuxClick={handleAuxClick}
      />
    );
  }

  // ── Zap receipt layout (kind 9735 / 8333) ──
  // Skipped when `profileZapRecipient` is set AND the event has a single
  // recipient — those are profile-targeted zaps that render with the
  // "recipient as headline" layout above. Multi-recipient kind 8333 events
  // fall through to this branch even when `profileZapRecipient` is set, so
  // the avatar stack can replace the single-recipient layout.
  if (isZap && (!profileZapRecipient || isMultiRecipientOnchainZap)) {
    // `getZapAmountSats` handles both kinds — kind 9735 reads the bolt11
    // millisats and divides by 1000; kind 8333 reads the `amount` tag
    // (already in sats). The previous `extractZapAmount(event) / 1000`
    // path only worked for kind 9735 and silently divided kind 8333 sats
    // by 1000, displaying 1/1000th of the actual zap.
    const zapAmountSats = getZapAmountSats(event);
    const zapMessage = extractZapMessage(event);
    const iconSize = threaded || threadedLast ? "size-10" : "size-11";
    // Multi-recipient batch zap (NIP-BC) — render the recipient pubkeys as
    // an avatar stack in the card body. The "zapped N people" verb in the
    // ActorRow makes the count explicit; the stack shows who.
    const zapRecipients = isMultiRecipientOnchainZap ? extractOnchainZapRecipients(event) : [];
    return (
      <ActivityCard
        header={wrapperHeader}
        icon={
          <div className={cn("flex items-center justify-center rounded-full bg-amber-500/10 shrink-0", iconSize)}>
            <Zap className="size-5 text-amber-500 fill-amber-500" />
          </div>
        }
        actorRow={
          <ActorRow pubkey={zapSenderPubkey} profileUrl={zapSenderUrl} avatarShape={zapSenderShape} picture={zapSenderMeta?.picture}
            displayName={zapSenderName} authorEvent={zapSender.data?.event} isLoading={zapSender.isLoading}
            label={isMultiRecipientOnchainZap ? `zapped ${zapRecipients.length} people` : "zapped"}
            timestampLabel={timeAgo(event.created_at)}
            extra={zapAmountSats > 0 ? (
              <span className="text-sm font-semibold text-amber-500 shrink-0">
                {formatMoney(zapAmountSats)}
              </span>
            ) : undefined}
          />
        }
        threaded={threaded} threadedLast={threadedLast} threadedLineClassName={threadedLineClassName}
        className={className} onClick={handleCardClick} onAuxClick={handleAuxClick}
      >
        {isMultiRecipientOnchainZap && zapRecipients.length > 0 && (
          <div className="mt-1.5">
            <PeopleAvatarStack pubkeys={zapRecipients} size="sm" maxVisible={6} />
          </div>
        )}
        {zapMessage && <p className="text-xs text-muted-foreground italic mt-1">&ldquo;{zapMessage}&rdquo;</p>}
      </ActivityCard>
    );
  }

  // ── Poll vote layout (kind 1018) ──
  if (isPollVote) {
    const iconSize = threaded || threadedLast ? "size-10" : "size-11";
    return (
      <ActivityCard
        header={wrapperHeader}
        icon={
          <ProfileHoverCard pubkey={event.pubkey} asChild>
            <Link to={profileUrl} className="shrink-0" onClick={(e) => e.stopPropagation()}>
              <Avatar shape={avatarShape} className={iconSize}>
                <AvatarImage src={metadata?.picture} alt={displayName} />
                <AvatarFallback className="bg-primary/20 text-primary text-sm">{displayName[0]?.toUpperCase()}</AvatarFallback>
              </Avatar>
            </Link>
          </ProfileHoverCard>
        }
        actorRow={
          <div className="flex items-center gap-1.5">
            <ProfileHoverCard pubkey={event.pubkey} asChild>
              <Link to={profileUrl} className="font-semibold text-sm hover:underline truncate" onClick={(e) => e.stopPropagation()}>
                {author.data?.event ? <EmojifiedText tags={author.data.event.tags}>{displayName}</EmojifiedText> : displayName}
              </Link>
            </ProfileHoverCard>
            <span className="text-sm text-muted-foreground shrink-0">voted</span>
            <span className="text-xs text-muted-foreground ml-auto shrink-0">{timeAgo(event.created_at)}</span>
          </div>
        }
        threaded={threaded} threadedLast={threadedLast} threadedLineClassName={threadedLineClassName}
        className={className} onClick={handleCardClick} onAuxClick={handleAuxClick}
      >
        {pollVoteLabel && <p className="text-sm font-semibold mt-0.5 truncate">{pollVoteLabel}</p>}
      </ActivityCard>
    );
  }

  // ── Threaded layout (with or without connector line) ──
  if (threaded || threadedLast) {
    // Kind action header (e.g. "updated their badges") — same logic as normal layout
    const threadedKindHeader = !repostedBy && !reactedBy && !zappedBy && !profileZapRecipient && !hideKindHeader && KIND_HEADER_MAP[event.kind]
      ? (() => {
          const cfg = KIND_HEADER_MAP[event.kind];
          const isLive = event.kind === 30311 && getEffectiveStreamStatus(event) === "live";
          return (
            <EventActionHeader
              pubkey={event.pubkey}
              icon={cfg.icon}
              iconClassName={
                event.kind === 30311
                  ? isLive ? "text-primary" : "text-muted-foreground"
                  : cfg.iconClassName
              }
              action={typeof cfg.action === "function" ? cfg.action(event) : cfg.action}
              noun={cfg.noun}
              nounRoute={cfg.nounRoute}
            />
          );
        })()
      : null;

    return (
      <article
        className={cn(
          "px-4 pt-3 hover:bg-secondary/30 transition-colors cursor-pointer overflow-hidden",
          threaded ? "pb-0" : "pb-3 border-b border-border",
          className,
        )}
        onClick={handleCardClick}
        onAuxClick={handleAuxClick}
      >
        {wrapperHeader ?? threadedKindHeader}
        <div className="flex gap-3">
          <div className="flex flex-col items-center">
            {avatarElement}
            {threaded && (
              <div className={cn("w-0.5 flex-1 mt-2 rounded-full", threadedLineClassName || "bg-foreground/20")} />
            )}
          </div>
          <div className={cn("flex-1 min-w-0", threaded && "pb-3")}>
            {authorInfo}
            {contentBlock}
            {actionButtons}
            <NoteMoreMenu
              event={event}
              open={moreMenuOpen}
              onOpenChange={setMoreMenuOpen}
            />
            <ReplyComposeModal
              event={event}
              open={replyOpen}
              onOpenChange={setReplyOpen}
            />
          </div>
        </div>
      </article>
    );
  }

  // ── Normal layout ──
  return (
    <article
      className={cn(
        "px-4 py-3 border-b border-border hover:bg-secondary/30 transition-colors cursor-pointer overflow-hidden",
        highlight && "animate-highlight-fade",
        className,
      )}
      onClick={handleCardClick}
      onAuxClick={handleAuxClick}
    >
      {/* Action header — wrapper (repost/reaction/zap) takes priority, otherwise derived from event kind */}
      {wrapperHeader ? (
        wrapperHeader
      ) : (
        !hideKindHeader && !profileZapRecipient && KIND_HEADER_MAP[event.kind] &&
        (() => {
          const cfg = KIND_HEADER_MAP[event.kind];
          const isLive =
            event.kind === 30311 && getEffectiveStreamStatus(event) === "live";
          return (
            <EventActionHeader
              pubkey={event.pubkey}
              icon={cfg.icon}
              iconClassName={
                event.kind === 30311
                  ? isLive
                    ? "text-primary"
                    : "text-muted-foreground"
                  : cfg.iconClassName
              }
              action={
                typeof cfg.action === "function"
                  ? cfg.action(event)
                  : cfg.action
              }
              noun={cfg.noun}
              nounRoute={cfg.nounRoute}
            />
          );
        })()
      )}

      {/* Header: avatar + name/handle stacked */}
      <div className="flex items-center gap-3">
        {avatarElement}
        {authorInfo}
        {isColor && <ColorMomentEyeButton event={event} />}
      </div>

      {contentBlock}

      {/* Action buttons — hidden in compact/embed mode */}
        {!compact && (
          <>
            {actionButtons}
            <NoteMoreMenu
              event={event}
              open={moreMenuOpen}
              onOpenChange={setMoreMenuOpen}
            />
            <ReplyComposeModal
              event={event}
              open={replyOpen}
              onOpenChange={setReplyOpen}
            />
          </>
        )}
    </article>
  );
});

const MAX_HEIGHT = 400; // px — posts taller than this get truncated

/** Truncates long text note content with a "Read more" fade + button.
 *  Media attachments render inline within NoteContent at their original content position. */
function TruncatedNoteContent({
  event,
}: {
  event: NostrEvent;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const mediaDominant = isMediaDominantPost(event);

  const measure = useCallback(() => {
    const el = contentRef.current;
    if (el) setOverflows(!mediaDominant && el.scrollHeight > MAX_HEIGHT);
  }, [mediaDominant]);

  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  // Re-measure after images load — scrollHeight is unreliable before images have rendered.
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const imgs = el.querySelectorAll("img");
    if (imgs.length === 0) return;
    imgs.forEach((img) =>
      img.addEventListener("load", measure, { once: true }),
    );
    return () =>
      imgs.forEach((img) => img.removeEventListener("load", measure));
  }, [measure]);

  return (
    <div className="mt-2 break-words overflow-hidden">
      <div
        ref={contentRef}
        style={
          !expanded && overflows
            ? { maxHeight: MAX_HEIGHT, overflow: "hidden" }
            : undefined
        }
        className="relative"
      >
        <NoteContent event={event} className="text-[15px] leading-relaxed" />
        {!expanded && overflows && (
          <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-background to-transparent pointer-events-none" />
        )}
      </div>
      {overflows && (
        <button
          className="mt-1 text-sm text-primary hover:underline"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
        >
          {expanded ? "Show less" : "Read more"}
        </button>
      )}
    </div>
  );
}

// ── NIP-68 Photo content (kind 20) ────────────────────────────────────────────

/** Parse all imeta image URLs from NIP-68 photo events. */
function parsePhotoUrls(
  tags: string[][],
): Array<{ url: string; alt?: string; blurhash?: string }> {
  const results: Array<{ url: string; alt?: string; blurhash?: string }> = [];
  for (const tag of tags) {
    if (tag[0] !== "imeta") continue;
    const parts: Record<string, string> = {};
    for (let i = 1; i < tag.length; i++) {
      const p = tag[i];
      const sp = p.indexOf(" ");
      if (sp !== -1) parts[p.slice(0, sp)] = p.slice(sp + 1);
    }
    if (parts.url)
      results.push({
        url: parts.url,
        alt: parts.alt,
        blurhash: parts.blurhash,
      });
  }
  return results;
}

/** Inline photo gallery for NIP-68 kind 20 events. */
function PhotoContent({ event }: { event: NostrEvent }) {
  const photos = useMemo(() => parsePhotoUrls(event.tags), [event.tags]);
  const title = getTag(event.tags, "title");
  const description = event.content;
  const hashtags = event.tags.filter(([n]) => n === "t").map(([, v]) => v);

  // Build imetaMap with dim + blurhash so ImageGallery can show blurhash placeholders
  const imetaMap = useMemo(() => {
    const map = new Map<string, { dim?: string; blurhash?: string }>();
    for (const photo of photos) {
      map.set(photo.url, { blurhash: photo.blurhash });
    }
    return map;
  }, [photos]);

  if (photos.length === 0) return null;

  return (
    <div className="mt-2 space-y-2">
      {title && <p className="font-semibold text-[15px]">{title}</p>}
      <ImageGallery
        images={photos.map((p) => p.url)}
        maxVisible={4}
        maxGridHeight="480px"
        imetaMap={imetaMap}
      />
      {description && (
        <p className="text-[15px] leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}
      {hashtags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {hashtags.slice(0, 5).map((tag) => (
            <Link
              key={tag}
              to={`/t/${encodeURIComponent(tag)}`}
              className="text-xs text-primary hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              #{tag}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// ── NIP-71 Video content (kinds 21 & 22) ──────────────────────────────────────

/** Parse the primary video url and thumbnail from NIP-71 imeta tags. */
function parseVideoImeta(tags: string[][]): {
  url?: string;
  thumbnail?: string;
  duration?: string;
} {
  for (const tag of tags) {
    if (tag[0] !== "imeta") continue;
    const parts: Record<string, string> = {};
    for (let i = 1; i < tag.length; i++) {
      const p = tag[i];
      const sp = p.indexOf(" ");
      if (sp !== -1) parts[p.slice(0, sp)] = p.slice(sp + 1);
    }
    if (parts.url)
      return {
        url: parts.url,
        thumbnail: parts.image,
        duration: parts.duration,
      };
  }
  // Fallback to plain url/thumb tags
  return {
    url: tags.find(([n]) => n === "url")?.[1],
    thumbnail:
      tags.find(([n]) => n === "thumb")?.[1] ??
      tags.find(([n]) => n === "image")?.[1],
  };
}

/** Format seconds into MM:SS / HH:MM:SS. */
function fmtDuration(seconds: string | undefined): string | undefined {
  const s = parseFloat(seconds ?? "");
  if (isNaN(s) || s <= 0) return undefined;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Inline video player for NIP-71 kind 21 events. */
function VideoContent({ event }: { event: NostrEvent }) {
  const { url, thumbnail, duration } = useMemo(
    () => parseVideoImeta(event.tags),
    [event.tags],
  );
  const title = getTag(event.tags, "title");
  const description = event.content;
  const formattedDuration = fmtDuration(duration);
  const hashtags = event.tags.filter(([n]) => n === "t").map(([, v]) => v);

  if (!url) return null;

  return (
    <div className="mt-2 space-y-2">
      {title && <p className="font-semibold text-[15px]">{title}</p>}
      <div className="relative rounded-xl overflow-hidden bg-muted">
        <VideoPlayer src={url} poster={thumbnail} title={title ?? undefined} />
        {formattedDuration && (
          <div className="absolute bottom-2 right-2 bg-black/80 text-white text-[10px] px-1.5 py-0.5 rounded font-medium pointer-events-none">
            {formattedDuration}
          </div>
        )}
      </div>
      {description && (
        <p className="text-[15px] leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}
      {hashtags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {hashtags.slice(0, 5).map((tag) => (
            <Link
              key={tag}
              to={`/t/${encodeURIComponent(tag)}`}
              className="text-xs text-primary hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              #{tag}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/** Media content for kind 22 / 34236 short-form video events — rendered at full card width. */
function VineMedia({
  imeta,
  hashtags,
}: {
  imeta?: { url?: string; thumbnail?: string };
  hashtags: string[];
}) {
  const { config } = useAppContext();
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(isVineMuted);

  // Pause video when scrolled out of view
  useEffect(() => {
    const video = videoRef.current;
    const container = containerRef.current;
    if (!video || !container) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting && !video.paused) {
          video.pause();
        }
      },
      { threshold: 0.25 },
    );

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const handlePlayToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      // If the autoplay-videos setting is off, a click-to-play is an explicit
      // user gesture and should play with sound — consistent with the regular
      // VideoPlayer. When autoplay is on, browsers require the initial play()
      // to be muted, so defer to the shared vine mute state.
      const startMuted = config.autoplayVideos ? isVineMuted() : false;
      video.muted = startMuted;
      video.play().then(() => {
        // Persist the choice so other vine players (and this one on next play)
        // follow suit until the user toggles mute again.
        setVineMuted(startMuted);
        setIsMuted(startMuted);
      }).catch(() => {
        // play blocked — retry muted as a fallback
        video.muted = true;
        video.play().then(() => {
          setVineMuted(true);
          setIsMuted(true);
        }).catch(() => {
          // still blocked — leave paused
        });
      });
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  const handleMuteToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    const video = videoRef.current;
    if (!video) return;
    const next = !video.muted;
    video.muted = next;
    setVineMuted(next);
    setIsMuted(next);
  };

  return (
    <>
      {imeta?.url && (
        <div
          ref={containerRef}
          className="relative mt-3 rounded-2xl overflow-hidden cursor-pointer"
          onClick={handlePlayToggle}
        >
          <video
            ref={videoRef}
            src={imeta.url}
            poster={imeta.thumbnail}
            className="w-full max-h-[70vh] object-cover"
            loop
            playsInline
            muted={isMuted}
            preload="none"
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
          />
          {!isPlaying && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/20">
              <div className="size-14 rounded-full bg-black/60 flex items-center justify-center backdrop-blur-sm">
                <Play className="size-7 text-white ml-1" fill="white" />
              </div>
            </div>
          )}
          {/* Mute/unmute toggle */}
          {isPlaying && (
            <button
              className="absolute bottom-2.5 right-2.5 z-10 size-8 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/70 transition-colors"
              onClick={handleMuteToggle}
              aria-label={isMuted ? "Unmute" : "Mute"}
            >
              {isMuted ? (
                <VolumeX className="size-4" />
              ) : (
                <Volume2 className="size-4" />
              )}
            </button>
          )}
        </div>
      )}

      {hashtags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {hashtags.slice(0, 5).map((tag) => (
            <Link
              key={tag}
              to={`/t/${encodeURIComponent(tag)}`}
              className="text-xs text-primary hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              #{tag}
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

/** Stream status badge config. */
function getStreamStatusConfig(status: string | undefined) {
  switch (status) {
    case "live":
      return {
        label: "LIVE",
        className: "bg-red-600 hover:bg-red-600 text-white border-red-600",
      };
    case "ended":
      return {
        label: "ENDED",
        className: "bg-muted text-muted-foreground border-border",
      };
    case "planned":
      return {
        label: "PLANNED",
        className:
          "bg-blue-600/90 hover:bg-blue-600/90 text-white border-blue-600",
      };
    default:
      return {
        label: status?.toUpperCase() || "UNKNOWN",
        className: "bg-muted text-muted-foreground border-border",
      };
  }
}

/** Inline content for kind 30311 live stream events. */
function StreamContent({ event }: { event: NostrEvent }) {
  const title = getTag(event.tags, "title") || "Untitled Stream";
  const summary = getTag(event.tags, "summary");
  const imageUrl = getTag(event.tags, "image");
  const streamingUrl = getTag(event.tags, "streaming");
  const status = getEffectiveStreamStatus(event);
  const currentParticipants = getTag(event.tags, "current_participants");
  const statusConfig = getStreamStatusConfig(status);

  const isLive = status === "live" && !!streamingUrl;

  const encodedId = useMemo(() => {
    const dTag = getTag(event.tags, "d") || "";
    return nip19.naddrEncode({
      kind: event.kind,
      pubkey: event.pubkey,
      identifier: dTag,
    });
  }, [event]);

  const { onClick: openPost } = useOpenPost(`/${encodedId}`);

  return (
    <div className="mt-2 space-y-2">
      {/* Stream player / thumbnail */}
      <div className="rounded-xl overflow-hidden border border-border">
        {isLive ? (
          // Inline live player — clicks on the player are intercepted so they don't navigate away
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <LiveStreamPlayer
              src={streamingUrl}
              poster={imageUrl}
              title={title}
            />
            {/* Status + viewer overlay on top of the player */}
            <div className="absolute top-2 left-2 z-10 flex items-center gap-2 pointer-events-none">
              <Badge
                variant="outline"
                className={cn("text-[10px]", statusConfig.className)}
              >
                <div className="size-1.5 bg-white rounded-full animate-pulse mr-1" />
                {statusConfig.label}
              </Badge>
              {currentParticipants && (
                <span className="flex items-center gap-1 bg-black/60 text-white text-xs px-2 py-0.5 rounded">
                  <Users className="size-3" />
                  {currentParticipants}
                </span>
              )}
            </div>
          </div>
        ) : imageUrl ? (
          <div className="relative w-full aspect-video overflow-hidden bg-muted">
            <img
              src={imageUrl}
              alt=""
              className="w-full h-full object-cover"
              loading="lazy"
              onError={(e) => {
                (e.currentTarget.parentElement as HTMLElement).style.display =
                  "none";
              }}
            />
            <div className="absolute top-2 left-2">
              <Badge
                variant="outline"
                className={cn("text-[10px]", statusConfig.className)}
              >
                {statusConfig.label}
              </Badge>
            </div>
            {currentParticipants && (
              <div className="absolute bottom-2 right-2 flex items-center gap-1 bg-black/60 text-white text-xs px-2 py-0.5 rounded">
                <Users className="size-3" />
                {currentParticipants}
              </div>
            )}
          </div>
        ) : (
          // No image, no live stream — show a minimal placeholder with status
          <div className="flex items-center gap-3 px-3 py-2.5 bg-muted/40">
            <Radio className="size-4 text-primary shrink-0" />
            <Badge
              variant="outline"
              className={cn("text-[10px]", statusConfig.className)}
            >
              {status === "live" && (
                <div className="size-1.5 bg-white rounded-full animate-pulse mr-1" />
              )}
              {statusConfig.label}
            </Badge>
            {currentParticipants && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Users className="size-3" />
                {currentParticipants}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Title + summary — clickable to open stream details */}
      <button
        type="button"
        className="flex items-start gap-2 text-left w-full group"
        onClick={(e) => {
          e.stopPropagation();
          openPost();
        }}
      >
        <Radio className="size-4 text-primary shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-sm leading-snug line-clamp-2 group-hover:underline">
            {title}
          </h3>
          {summary && (
            <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
              {summary}
            </p>
          )}
        </div>
      </button>
    </div>
  );
}

export interface EventActionHeaderProps {
  /** Pubkey of the person performing the action. */
  pubkey: string;
  /** Lucide icon component shown to the left of the author name. */
  icon: React.ComponentType<{ className?: string }>;
  /**
   * Optional pre-rendered icon node that takes priority over `icon`. Use
   * this when the icon isn't a generic Lucide component — e.g. a reaction
   * emoji (`<ReactionEmoji>`) where the visual is data-driven. The node
   * is rendered as-is inside the same `w-11` slot, so it should size
   * itself (e.g. `className="size-4"`).
   */
  iconNode?: ReactNode;
  /** Optional className for the icon (defaults to text-primary). */
  iconClassName?: string;
  /** Verb phrase shown after the author name, e.g. "hid a" or "is streaming". */
  action: string;
  /** Optional noun shown after the verb, linked to a page route, e.g. "treasure" → /treasures. */
  noun?: string;
  /** Route to link the noun to, e.g. "/treasures". */
  nounRoute?: string;
  /**
   * Optional underlying event (reaction, zap, repost) that the verb should
   * link to. When provided, the entire verb (and the optional `extra`
   * suffix) is wrapped in a Link pointing at `/${nevent}` so the user
   * can navigate directly to the underlying event detail page.
   */
  actionEvent?: NostrEvent;
  /**
   * Optional inline content appended after the verb — used for the sats
   * amount on zap headers ("zapped · 1,234 sats"). Rendered inside the
   * same Link as the verb when `actionEvent` is set.
   */
  extra?: ReactNode;
}

/** Static config for deriving the action header from an event's kind and tags. */
interface KindHeaderConfig {
  icon: React.ComponentType<{ className?: string }>;
  iconClassName?: string;
  /** Static action string, or a function that computes it from the event. */
  action: string | ((event: NostrEvent) => string);
  noun?: string;
  nounRoute?: string;
}

const KIND_HEADER_MAP: Record<number, KindHeaderConfig> = {
  20: {
    icon: Camera,
    action: "shared a",
    noun: "photo",
    nounRoute: "/photos",
  },
  4: {
    icon: Mail,
    action: "sent an",
    noun: "encrypted message",
  },
  8211: {
    icon: Mail,
    action: "sent a",
    noun: "letter",
    nounRoute: "/letters",
  },
  [LOVE_LIST_KIND]: {
    icon: Heart,
    iconClassName: "text-red-500",
    action: (event) => publishedAtAction(event, { created: "wrote their", updated: "updated their", fallback: "updated their" }),
    noun: "Love List",
  },
  37516: {
    icon: ChestIcon,
    action: (event) => publishedAtAction(event, { created: "hid a", updated: "updated a", fallback: "hid a" }),
    noun: "treasure",
    nounRoute: "/treasures",
  },
  7516: {
    icon: ChestIcon,
    action: "found a",
    noun: "treasure",
    nounRoute: "/treasures",
  },
  37381: {
    icon: CardsIcon,
    action: (event) => publishedAtAction(event, { created: "created a", updated: "updated a", fallback: "shared a" }),
    noun: "deck",
    nounRoute: "/decks",
  },
  36767: {
    icon: Sparkles,
    action: (event) => publishedAtAction(event, { created: "created a", updated: "updated a", fallback: "shared a" }),
    noun: "theme",
    nounRoute: "/themes",
  },
  16767: {
    icon: Sparkles,
    action: (event) => publishedAtAction(event, { created: "created a", updated: "updated their", fallback: "updated their" }),
    noun: "theme",
    nounRoute: "/themes",
  },
  30030: {
    icon: SmilePlus,
    action: (event) => publishedAtAction(event, { created: "created an", updated: "updated an", fallback: "shared an" }),
    noun: "emoji pack",
    nounRoute: "/emojis",
  },
  8: {
    icon: Award,
    action: "awarded a",
    noun: "badge",
    nounRoute: "/badges",
  },
  30009: {
    icon: Award,
    action: (event) => publishedAtAction(event, { created: "created a", updated: "updated a", fallback: "created a" }),
    noun: "badge",
    nounRoute: "/badges",
  },
  10008: {
    icon: Award,
    action: (event) => publishedAtAction(event, { created: "created their", updated: "updated their", fallback: "updated their" }),
    noun: "badges",
    nounRoute: "/badges",
  },
  30008: {
    icon: Award,
    action: (event) => {
      // Kind 30008 is overloaded: legacy NIP-58 profile badges
      // (`d=profile_badges`) vs. NIP-51 badge set (arbitrary `d`).
      if (isProfileBadgesEvent(event)) {
        return publishedAtAction(event, { created: "created their", updated: "updated their", fallback: "updated their" });
      }
      // Badge set — interpolate the set's title into the verb so the
      // header reads "Alice updated Super Mario Bros." with "badges"
      // rendered as the linked noun ("/badges") by EventActionHeader.
      const title = parseBadgeSet(event)?.title;
      const base = publishedAtAction(event, { created: "created", updated: "updated", fallback: "updated" });
      return title ? `${base} ${title}` : base;
    },
    noun: "badges",
    nounRoute: "/badges",
  },
  30311: {
    icon: Radio,
    iconClassName: undefined, // computed dynamically below
    action: (event) =>
      getEffectiveStreamStatus(event) === "live"
        ? "is streaming"
        : "streamed",
  },
  32267: {
    icon: Package,
    action: (event) => publishedAtAction(event, { created: "published a Zapstore app", updated: "updated a Zapstore app", fallback: "published a Zapstore app" }),
  },
  30063: {
    icon: Package,
    action: (event) => publishedAtAction(event, { created: "published a Zapstore release", updated: "updated a Zapstore release", fallback: "published a Zapstore release" }),
  },
  3063: {
    icon: Package,
    action: "published a Zapstore asset",
  },
  31990: {
    icon: Package,
    action: (event) => publishedAtAction(event, { created: "published an app", updated: "updated an app", fallback: "published an app" }),
  },
  30617: {
    icon: GitBranch,
    action: (event) => publishedAtAction(event, { created: "created a", updated: "updated a", fallback: "shared a" }),
    noun: "repository",
    nounRoute: "/development",
  },
  1617: {
    icon: FileText,
    action: "submitted a",
    noun: "patch",
    nounRoute: "/development",
  },
  1618: {
    icon: GitPullRequest,
    action: "opened a",
    noun: "pull request",
    nounRoute: "/development",
  },
  30817: {
    icon: FileCode,
    action: (event) => publishedAtAction(event, { created: "proposed a", updated: "updated a", fallback: "proposed a" }),
    noun: "NIP",
    nounRoute: "/development",
  },
  15128: {
    icon: Rocket,
    action: (event) => publishedAtAction(event, { created: "deployed an", updated: "redeployed an", fallback: "deployed an" }),
    noun: "nsite",
    nounRoute: "/development",
  },
  35128: {
    icon: Rocket,
    action: (event) => publishedAtAction(event, { created: "deployed an", updated: "redeployed an", fallback: "deployed an" }),
    noun: "nsite",
    nounRoute: "/development",
  },
  9735: {
    icon: Zap,
    action: "zapped",
  },
  9802: {
    icon: Quote,
    action: "shared a",
    noun: "highlight",
    nounRoute: "/highlights",
  },
  33863: {
    icon: HandHeart,
    action: (event) => publishedAtAction(event, { created: "started a", updated: "updated their", fallback: "shared a" }),
    noun: "fundraiser",
  },
  8333: {
    icon: Zap,
    action: "zapped",
  },
  31124: {
    icon: Egg,
    action: (event) => publishedAtAction(event, { created: "created their", updated: "cared for their", fallback: "cared for their" }),
    noun: "Blobbi",
    nounRoute: "/blobbi",
  },
  39089: {
    icon: PartyPopper,
    action: (event) => publishedAtAction(event, { created: "created a", updated: "updated a", fallback: "shared a" }),
    noun: "follow pack",
    nounRoute: "/packs",
  },
  30000: {
    icon: Users,
    action: (event) => publishedAtAction(event, { created: "created a", updated: "updated a", fallback: "shared a" }),
    noun: "follow set",
    nounRoute: "/packs",
  },
  36787: {
    icon: Music,
    action: (event) => publishedAtAction(event, { created: "shared a", updated: "updated a", fallback: "shared a" }),
    noun: "track",
    nounRoute: "/music",
  },
  34139: {
    icon: ListMusic,
    action: (event) => publishedAtAction(event, { created: "created a", updated: "updated a", fallback: "shared a" }),
    noun: "playlist",
    nounRoute: "/music",
  },
  2473: {
    icon: Bird,
    action: "heard a",
    noun: "bird",
  },
  30621: {
    icon: Stars,
    action: (event) => publishedAtAction(event, { created: "drew a", updated: "redrew a", fallback: "drew a" }),
    noun: "constellation",
  },
  3: {
    icon: UserCheck,
    action: "updated their",
    noun: "follow list",
  },
};

/** Generic action header: icon · [author name] [action] [linked noun] */
export function EventActionHeader({
  pubkey,
  icon: Icon,
  iconNode,
  iconClassName,
  action,
  noun,
  nounRoute,
  actionEvent,
  extra,
}: EventActionHeaderProps) {
  const author = useAuthor(pubkey);
  const name = author.data?.metadata?.name || author.data?.metadata?.display_name || 'Anonymous';
  const url = useProfileUrl(pubkey, author.data?.metadata);
  const actionHref = useMemo(
    () => (actionEvent ? `/${encodeEventAddress(actionEvent)}` : undefined),
    [actionEvent],
  );

  const verbContent = (
    <>
      {action}
      {extra ? <> {extra}</> : null}
    </>
  );

  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground mb-3 min-w-0">
      <div className="w-11 shrink-0 flex justify-end">
        {iconNode ?? (
          <Icon
            className={cn(
              "size-4 translate-y-px",
              iconClassName ?? "text-primary",
            )}
          />
        )}
      </div>
      <div className="flex items-center min-w-0">
        {author.isLoading ? (
          <Skeleton className="h-3 w-20 inline-block" />
        ) : (
          <ProfileHoverCard pubkey={pubkey} asChild>
            <Link
              to={url}
              className="font-medium hover:underline mr-1 truncate"
              onClick={(e) => e.stopPropagation()}
            >
              {author.data?.event ? (
                <EmojifiedText tags={author.data.event.tags}>
                  {name}
                </EmojifiedText>
              ) : (
                name
              )}
            </Link>
          </ProfileHoverCard>
        )}
        <span className={cn("shrink-0", author.isLoading && "ml-1")}>
          {actionHref ? (
            <Link
              to={actionHref}
              className="hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {verbContent}
            </Link>
          ) : (
            verbContent
          )}
          {noun && nounRoute && (
            <>
              {" "}
              <Link
                to={nounRoute}
                className="hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                {noun}
              </Link>
            </>
          )}
          {noun && !nounRoute && <> {noun}</>}
        </span>
      </div>
    </div>
  );
}

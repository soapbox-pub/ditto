import type React from 'react';
import { type ReactNode, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { defineMessages, FormattedMessage, useIntl, type IntlShape, type MessageDescriptor } from 'react-intl';
import { nip19 } from 'nostr-tools';
import {
  Award, BarChart3, Bird, Bitcoin, Bookmark, BookOpen, Box, CalendarClock, Camera, CircleCheck, CircleDashed, CircleDot, CircleX, Clapperboard, ClipboardCheck, ClipboardList, Crown, Egg, FileText, Film,
  Flag,
  GitBranch, GitPullRequest, HandHeart, Heart, History, Link2, Magnet, Mail, MapPin, MessageSquare, Mic, MoonStar, Music, Newspaper,
  Video,
  Package, Palette, PartyPopper, Podcast, Quote, Radio, Rocket, ShieldCheck, SmilePlus, Sparkles,
  Server, Stars, UserCheck, Users, Vote, Zap,
  Tag,
} from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';

import { BitcoinTxPreview, BitcoinAddressPreview } from '@/components/BitcoinContentHeader';
import { CardsIcon } from '@/components/icons/CardsIcon';
import { ChestIcon } from '@/components/icons/ChestIcon';
import { RepostIcon } from '@/components/icons/RepostIcon';
import { EmbeddedNote } from '@/components/EmbeddedNote';
import { EmbeddedNaddr } from '@/components/EmbeddedNaddr';
import { LinkPreview } from '@/components/LinkPreview';
import { ProfileHoverCard } from '@/components/ProfileHoverCard';
import { ReplyContext } from '@/components/ReplyContext';
import { ReactionEmoji, EmojifiedText } from '@/components/CustomEmoji';
import { ExternalFavicon } from '@/components/ExternalFavicon';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAddrEvent, useEvent } from '@/hooks/useEvent';
import { usePollVoteLabel } from '@/hooks/usePollVoteLabel';
import { useAuthor } from '@/hooks/useAuthor';
import { useBookInfo } from '@/hooks/useBookInfo';
import { useFormatMoney } from '@/hooks/useFormatMoney';
import { useLinkPreview } from '@/hooks/useLinkPreview';
import { useScryfallCard } from '@/hooks/useScryfallCard';
import { getDisplayName } from '@/lib/getDisplayName';
import { getCountryInfo } from '@/lib/countries';
import { extractGathererCard, type GathererCard } from '@/lib/linkEmbed';
import { isNostrId } from '@/lib/nostrId';
import { isNsiteKind, NSITE_SNAPSHOT_KIND } from '@/lib/nsiteSubdomain';
import { parseAddr } from '@/lib/parseAddr';
import { cardPrimaryImage } from '@/lib/scryfall';
import { getZapAmountSats, getZapSenderPubkey } from '@/lib/zapHelpers';


/** Default classes shared by all comment context rows. */
const ROW_CLASS = 'flex items-center gap-x-1 text-sm text-muted-foreground mt-2 mb-1 min-w-0 overflow-hidden';

/** Parsed root reference from a kind 1111 comment's uppercase tags. */
interface CommentRoot {
  type: 'event' | 'addr' | 'external';
  /** For type 'event': the root event ID. */
  eventId?: string;
  /** For type 'addr': the addressable event coordinates. */
  addr?: { kind: number; pubkey: string; identifier: string };
  /** For type 'external': the raw identifier (URL, ISBN, etc.). */
  identifier?: string;
  /** Root kind number (from K tag). */
  rootKind?: string;
  /** Relay URL hint from the E or A tag (position [2]). */
  relayHint?: string;
  /** Author pubkey hint extracted from the E tag (position [3]) or P tag. */
  authorHint?: string;
}

/**
 * Parse the root reference from a kind 1111 comment's tags.
 *
 * **Postcondition:** any returned `addr.pubkey`, `eventId`, or `authorHint`
 * is a valid 64-char lowercase hex string (or `undefined`). Renderers can
 * pass these to `nip19.*Encode` without guarding. If the primary uppercase
 * tag is malformed we fall through to the next tag type rather than
 * returning a partially-broken root.
 */
function parseCommentRoot(event: NostrEvent): CommentRoot | undefined {
  const aTagFull = event.tags.find(([name]) => name === 'A');
  // Use find (not findLast) to get the root E tag, not a parent e tag
  const eTagFull = event.tags.find(([name]) => name === 'E');
  const iTag = event.tags.find(([name]) => name === 'I')?.[1];
  const kTag = event.tags.find(([name]) => name === 'K')?.[1];
  // P tag holds the root event author's pubkey — used as author hint fallback
  const pTag = event.tags.find(([name]) => name === 'P')?.[1];

  if (aTagFull) {
    const aTag = aTagFull[1];
    const relayHint = aTagFull[2] || undefined;
    const addr = parseAddr(aTag);
    if (addr) {
      return { type: 'addr', addr, rootKind: kTag, relayHint };
    }
    // Malformed A tag — fall through to E / I tags below.
  }

  if (eTagFull) {
    const eTag = eTagFull[1];
    const relayHint = eTagFull[2] || undefined;
    // NIP-22 E tags may have the author pubkey at position [3]; fall back to P tag.
    const rawAuthorHint = eTagFull[3] || pTag || undefined;
    const authorHint = isNostrId(rawAuthorHint) ? rawAuthorHint : undefined;
    if (isNostrId(eTag)) {
      return { type: 'event', eventId: eTag, rootKind: kTag, relayHint, authorHint };
    }
    // Malformed E tag — fall through to I tag below.
  }

  if (iTag) {
    return { type: 'external', identifier: iTag, rootKind: kTag };
  }

  return undefined;
}

/** Singular kind nouns, shared by kinds that read the same (e.g. both repost kinds). */
const KIND_LABEL = defineMessages({
  profile: { id: 'commentContext.kind.profile', defaultMessage: 'a profile' },
  post: { id: 'commentContext.kind.post', defaultMessage: 'a post' },
  followList: { id: 'commentContext.kind.followList', defaultMessage: 'a follow list' },
  encryptedMessage: { id: 'commentContext.kind.encryptedMessage', defaultMessage: 'an encrypted message' },
  repost: { id: 'commentContext.kind.repost', defaultMessage: 'a repost' },
  reaction: { id: 'commentContext.kind.reaction', defaultMessage: 'a reaction' },
  badgeAward: { id: 'commentContext.kind.badgeAward', defaultMessage: 'a badge award' },
  relayList: { id: 'commentContext.kind.relayList', defaultMessage: 'a relay list' },
  linkedAccounts: { id: 'commentContext.kind.linkedAccounts', defaultMessage: 'linked accounts' },
  photo: { id: 'commentContext.kind.photo', defaultMessage: 'a photo' },
  video: { id: 'commentContext.kind.video', defaultMessage: 'a video' },
  shortVideo: { id: 'commentContext.kind.shortVideo', defaultMessage: 'a short video' },
  requestToVanish: { id: 'commentContext.kind.requestToVanish', defaultMessage: 'a request to vanish' },
  file: { id: 'commentContext.kind.file', defaultMessage: 'a file' },
  vote: { id: 'commentContext.kind.vote', defaultMessage: 'a vote' },
  poll: { id: 'commentContext.kind.poll', defaultMessage: 'a poll' },
  comment: { id: 'commentContext.kind.comment', defaultMessage: 'a comment' },
  voiceMessage: { id: 'commentContext.kind.voiceMessage', defaultMessage: 'a voice message' },
  liveChatMessage: { id: 'commentContext.kind.liveChatMessage', defaultMessage: 'a live chat message' },
  letter: { id: 'commentContext.kind.letter', defaultMessage: 'a letter' },
  loveList: { id: 'commentContext.kind.loveList', defaultMessage: 'a Love List' },
  top8: { id: 'commentContext.kind.top8', defaultMessage: 'a Top 8' },
  patch: { id: 'commentContext.kind.patch', defaultMessage: 'a patch' },
  pullRequest: { id: 'commentContext.kind.pullRequest', defaultMessage: 'a pull request' },
  pullRequestUpdate: { id: 'commentContext.kind.pullRequestUpdate', defaultMessage: 'a pull request update' },
  issue: { id: 'commentContext.kind.issue', defaultMessage: 'an issue' },
  statusUpdate: { id: 'commentContext.kind.statusUpdate', defaultMessage: 'a status update' },
  birdDetection: { id: 'commentContext.kind.birdDetection', defaultMessage: 'a bird detection' },
  birdex: { id: 'commentContext.kind.birdex', defaultMessage: 'a Birdex' },
  colorMoment: { id: 'commentContext.kind.colorMoment', defaultMessage: 'a color moment' },
  foundLog: { id: 'commentContext.kind.foundLog', defaultMessage: 'a found log' },
  nsiteSnapshot: { id: 'commentContext.kind.nsiteSnapshot', defaultMessage: 'an nsite snapshot' },
  nsite: { id: 'commentContext.kind.nsite', defaultMessage: 'an nsite' },
  theme: { id: 'commentContext.kind.theme', defaultMessage: 'a theme' },
  profileBadges: { id: 'commentContext.kind.profileBadges', defaultMessage: 'profile badges' },
  badgeSet: { id: 'commentContext.kind.badgeSet', defaultMessage: 'a badge set' },
  badge: { id: 'commentContext.kind.badge', defaultMessage: 'a badge' },
  article: { id: 'commentContext.kind.article', defaultMessage: 'an article' },
  ebook: { id: 'commentContext.kind.ebook', defaultMessage: 'an ebook' },
  magazine: { id: 'commentContext.kind.magazine', defaultMessage: 'a magazine' },
  magazineIssue: { id: 'commentContext.kind.magazineIssue', defaultMessage: 'a magazine issue' },
  emojiPack: { id: 'commentContext.kind.emojiPack', defaultMessage: 'an emoji pack' },
  podcastEpisode: { id: 'commentContext.kind.podcastEpisode', defaultMessage: 'a podcast episode' },
  podcastTrailer: { id: 'commentContext.kind.podcastTrailer', defaultMessage: 'a podcast trailer' },
  softwareAsset: { id: 'commentContext.kind.softwareAsset', defaultMessage: 'a software asset' },
  softwareRelease: { id: 'commentContext.kind.softwareRelease', defaultMessage: 'a software release' },
  stream: { id: 'commentContext.kind.stream', defaultMessage: 'a stream' },
  room: { id: 'commentContext.kind.room', defaultMessage: 'a room' },
  meeting: { id: 'commentContext.kind.meeting', defaultMessage: 'a meeting' },
  status: { id: 'commentContext.kind.status', defaultMessage: 'a status' },
  listing: { id: 'commentContext.kind.listing', defaultMessage: 'a listing' },
  repository: { id: 'commentContext.kind.repository', defaultMessage: 'a repository' },
  repositoryUpdate: { id: 'commentContext.kind.repositoryUpdate', defaultMessage: 'a repository update' },
  customNIP: { id: 'commentContext.kind.customNIP', defaultMessage: 'a custom NIP' },
  calendarEvent: { id: 'commentContext.kind.calendarEvent', defaultMessage: 'a calendar event' },
  app: { id: 'commentContext.kind.app', defaultMessage: 'an app' },
  softwareApp: { id: 'commentContext.kind.softwareApp', defaultMessage: 'a software app' },
  playlist: { id: 'commentContext.kind.playlist', defaultMessage: 'a playlist' },
  community: { id: 'commentContext.kind.community', defaultMessage: 'a community' },
  track: { id: 'commentContext.kind.track', defaultMessage: 'a track' },
  magicDeck: { id: 'commentContext.kind.magicDeck', defaultMessage: 'a Magic deck' },
  treasure: { id: 'commentContext.kind.treasure', defaultMessage: 'a treasure' },
  followSet: { id: 'commentContext.kind.followSet', defaultMessage: 'a follow set' },
  constellation: { id: 'commentContext.kind.constellation', defaultMessage: 'a constellation' },
  followPack: { id: 'commentContext.kind.followPack', defaultMessage: 'a follow pack' },
  zap: { id: 'commentContext.kind.zap', defaultMessage: 'a zap' },
  highlight: { id: 'commentContext.kind.highlight', defaultMessage: 'a highlight' },
  torrent: { id: 'commentContext.kind.torrent', defaultMessage: 'a torrent' },
  tarotReading: { id: 'commentContext.kind.tarotReading', defaultMessage: 'a tarot reading' },
  webBookmark: { id: 'commentContext.kind.webBookmark', defaultMessage: 'a web bookmark' },
  blobbi: { id: 'commentContext.kind.blobbi', defaultMessage: 'a Blobbi' },
  report: { id: 'commentContext.kind.report', defaultMessage: 'a report' },
  attestation: { id: 'commentContext.kind.attestation', defaultMessage: 'an attestation' },
  fundraiser: { id: 'commentContext.kind.fundraiser', defaultMessage: 'a fundraiser' },
  quiz: { id: 'commentContext.kind.quiz', defaultMessage: 'a quiz' },
  quizResult: { id: 'commentContext.kind.quizResult', defaultMessage: 'a quiz result' },
  threeDObject: { id: 'commentContext.kind.threeDObject', defaultMessage: 'a 3D object' },
  unsupportedEvent: { id: 'commentContext.kind.unsupportedEvent', defaultMessage: 'an unsupported event' },
  link: { id: 'commentContext.kind.link', defaultMessage: 'a link' },
  hashtag: { id: 'commentContext.kind.hashtag', defaultMessage: 'a hashtag' },
});

/**
 * Singular comment-context labels for every supported kind.
 * Must use singular form with article ("a post", "an article") since these
 * appear as "Commenting on {label}". EXTRA_KINDS labels are plural/categorical
 * ("Requests to Vanish", "User Statuses") and must NOT be used directly.
 */
const KIND_LABELS: Record<number, MessageDescriptor> = {
  0: KIND_LABEL.profile,
  1: KIND_LABEL.post,
  3: KIND_LABEL.followList,
  4: KIND_LABEL.encryptedMessage,
  6: KIND_LABEL.repost,
  7: KIND_LABEL.reaction,
  8: KIND_LABEL.badgeAward,
  16: KIND_LABEL.repost,
  10002: KIND_LABEL.relayList,
  10011: KIND_LABEL.linkedAccounts,
  20: KIND_LABEL.photo,
  21: KIND_LABEL.video,
  22: KIND_LABEL.shortVideo,
  34235: KIND_LABEL.video,
  62: KIND_LABEL.requestToVanish,
  1063: KIND_LABEL.file,
  1018: KIND_LABEL.vote,
  1068: KIND_LABEL.poll,
  1111: KIND_LABEL.comment,
  1222: KIND_LABEL.voiceMessage,
  1311: KIND_LABEL.liveChatMessage,
  8211: KIND_LABEL.letter,
  15683: KIND_LABEL.loveList,
  18678: KIND_LABEL.top8,
  1617: KIND_LABEL.patch,
  1618: KIND_LABEL.pullRequest,
  1619: KIND_LABEL.pullRequestUpdate,
  1621: KIND_LABEL.issue,
  1630: KIND_LABEL.statusUpdate,
  1631: KIND_LABEL.statusUpdate,
  1632: KIND_LABEL.statusUpdate,
  1633: KIND_LABEL.statusUpdate,
  2473: KIND_LABEL.birdDetection,
  12473: KIND_LABEL.birdex,
  3367: KIND_LABEL.colorMoment,
  7516: KIND_LABEL.foundLog,
  5128: KIND_LABEL.nsiteSnapshot,
  15128: KIND_LABEL.nsite,
  16767: KIND_LABEL.theme,
  10008: KIND_LABEL.profileBadges,
  // Kind 30008 = NIP-51 badge set (legacy `d=profile_badges` is routed
  // through ProfileBadgesCommentContext before reaching this map).
  30008: KIND_LABEL.badgeSet,
  30009: KIND_LABEL.badge,
  30023: KIND_LABEL.article,
  33953: KIND_LABEL.ebook,
  34609: KIND_LABEL.magazine,
  39731: KIND_LABEL.magazineIssue,
  30030: KIND_LABEL.emojiPack,
  30054: KIND_LABEL.podcastEpisode,
  30055: KIND_LABEL.podcastTrailer,
  3063: KIND_LABEL.softwareAsset,
  30063: KIND_LABEL.softwareRelease,
  30311: KIND_LABEL.stream,
  30312: KIND_LABEL.room,
  30313: KIND_LABEL.meeting,
  30315: KIND_LABEL.status,
  30402: KIND_LABEL.listing,
  30617: KIND_LABEL.repository,
  30618: KIND_LABEL.repositoryUpdate,
  30817: KIND_LABEL.customNIP,
  31922: KIND_LABEL.calendarEvent,
  31923: KIND_LABEL.calendarEvent,
  31990: KIND_LABEL.app,
  32267: KIND_LABEL.softwareApp,
  34139: KIND_LABEL.playlist,
  34236: KIND_LABEL.shortVideo,
  34550: KIND_LABEL.community,
  35128: KIND_LABEL.nsite,
  36767: KIND_LABEL.theme,
  36787: KIND_LABEL.track,
  37381: KIND_LABEL.magicDeck,
  37516: KIND_LABEL.treasure,
  30000: KIND_LABEL.followSet,
  30621: KIND_LABEL.constellation,
  39089: KIND_LABEL.followPack,
  9735: KIND_LABEL.zap,
  9802: KIND_LABEL.highlight,
  2003: KIND_LABEL.torrent,
  2256: KIND_LABEL.tarotReading,
  39701: KIND_LABEL.webBookmark,
  8333: KIND_LABEL.zap,
  31124: KIND_LABEL.blobbi,
  1984: KIND_LABEL.report,
  31871: KIND_LABEL.attestation,
  33863: KIND_LABEL.fundraiser,
  37849: KIND_LABEL.quiz,
  7849: KIND_LABEL.quizResult,
  33331: KIND_LABEL.threeDObject,
};

/** Kind-specific icons — matches sidebar and NoteCard icons. */
const KIND_ICONS: Partial<Record<number, React.ComponentType<{ className?: string }>>> = {
  0: Users,
  1: MessageSquare,
  4: Mail,
  6: RepostIcon,
  8: Award,
  16: RepostIcon,
  20: Camera,
  21: Film,
  22: Film,
  34235: Film,
  1063: FileText,
  1018: Vote,
  1068: BarChart3,
  1222: Mic,
  1311: Radio,
  1617: FileText,
  8211: Mail,
  15683: Heart,
  18678: Crown,
  1618: GitPullRequest,
  1619: GitPullRequest,
  1621: CircleDot,
  1630: CircleDot,
  1631: CircleCheck,
  1632: CircleX,
  1633: CircleDashed,
  5128: History,
  15128: Rocket,
  35128: Rocket,
  10008: Award,
  30008: Award,
  30009: Award,
  30023: BookOpen,
  39701: Bookmark,
  33953: BookOpen,
  34609: Newspaper,
  39731: Newspaper,
  30030: SmilePlus,
  30054: Podcast,
  30055: Podcast,
  3063: Package,
  30063: Package,
  30311: Radio,
  30312: Video,
  30313: CalendarClock,
  30402: Tag,
  30617: GitBranch,
  30618: GitBranch,
  31990: Package,
  32267: Package,
  34236: Clapperboard,
  36767: Sparkles,
  16767: Sparkles,
  36787: Music,
  34139: Music,
  37381: CardsIcon,
  37516: ChestIcon,
  7516: ChestIcon,
  3: UserCheck,
  10002: Server,
  10011: Link2,
  30000: Users,
  39089: PartyPopper,
  3367: Palette,
  9735: Zap,
  9802: Quote,
  2003: Magnet,
  2256: MoonStar,
  8333: Zap,
  31124: Egg,
  2473: Bird,
  12473: Bird,
  30621: Stars,
  1984: Flag,
  31871: ShieldCheck,
  33863: HandHeart,
  37849: ClipboardList,
  7849: ClipboardCheck,
  33331: Box,
};

/**
 * Get a singular comment-context label for a kind number.
 * Only uses KIND_LABELS (which has proper singular forms with articles).
 * Never falls through to EXTRA_KINDS labels since those are plural/categorical.
 * Unknown kinds render as "an unsupported event" — never as "a post", which
 * would misrepresent arbitrary event kinds as text notes.
 */
function getKindLabel(intl: IntlShape, kind: number): string {
  return intl.formatMessage(KIND_LABELS[kind] ?? KIND_LABEL.unsupportedEvent);
}

/** Parse a rootKind string into a label, handling both numeric and external content kinds. */
function getRootKindLabel(intl: IntlShape, rootKind: string | undefined): string {
  if (!rootKind) return intl.formatMessage(KIND_LABEL.post);

  const kindNum = parseInt(rootKind, 10);
  if (isNaN(kindNum)) {
    if (rootKind === 'web' || rootKind === 'https' || rootKind === 'http') return intl.formatMessage(KIND_LABEL.link);
    if (rootKind === '#') return intl.formatMessage(KIND_LABEL.hashtag);
    return rootKind;
  }

  return getKindLabel(intl, kindNum);
}

/** Suffix that describes the kind, appended after a title (e.g. "Wet Dry World theme"). */
const TITLED = defineMessages({
  badge: { id: 'commentContext.titled.badge', defaultMessage: '{title} badge' },
  badges: { id: 'commentContext.titled.badges', defaultMessage: '{title} badges' },
  emojiPack: { id: 'commentContext.titled.emojiPack', defaultMessage: '{title} emoji pack' },
  theme: { id: 'commentContext.titled.theme', defaultMessage: '{title} theme' },
  followSet: { id: 'commentContext.titled.followSet', defaultMessage: '{title} follow set' },
  followPack: { id: 'commentContext.titled.followPack', defaultMessage: '{title} follow pack' },
  deck: { id: 'commentContext.titled.deck', defaultMessage: '{title} deck' },
  treasure: { id: 'commentContext.titled.treasure', defaultMessage: '{title} treasure' },
  constellation: { id: 'commentContext.titled.constellation', defaultMessage: '{title} constellation' },
  community: { id: 'commentContext.titled.community', defaultMessage: '{title} community' },
  episode: { id: 'commentContext.titled.episode', defaultMessage: '{title} episode' },
  trailer: { id: 'commentContext.titled.trailer', defaultMessage: '{title} trailer' },
  playlist: { id: 'commentContext.titled.playlist', defaultMessage: '{title} playlist' },
  bookmark: { id: 'commentContext.titled.bookmark', defaultMessage: '{title} bookmark' },
  threeDObject: { id: 'commentContext.titled.threeDObject', defaultMessage: '{title} 3D object' },
  app: { id: 'commentContext.titled.app', defaultMessage: '{title} app' },
  softwareRelease: { id: 'commentContext.titled.softwareRelease', defaultMessage: '{title} software release' },
  softwareAsset: { id: 'commentContext.titled.softwareAsset', defaultMessage: '{title} software asset' },
  nsite: { id: 'commentContext.titled.nsite', defaultMessage: '{title} nsite' },
  nsiteSnapshot: { id: 'commentContext.titled.nsiteSnapshot', defaultMessage: '{title} nsite snapshot' },
});

const KIND_SUFFIXES: Partial<Record<number, MessageDescriptor>> = {
  30009: TITLED.badge,
  // Kind 30008 = NIP-51 badge set (legacy profile-badges variant is routed
  // separately by AddrCommentContext via the `profile_badges` d-tag check
  // before reaching this map).
  30008: TITLED.badges,
  30030: TITLED.emojiPack,
  36767: TITLED.theme,
  16767: TITLED.theme,
  30000: TITLED.followSet,
  39089: TITLED.followPack,
  37381: TITLED.deck,
  37516: TITLED.treasure,
  30621: TITLED.constellation,
  34550: TITLED.community,
  30054: TITLED.episode,
  30055: TITLED.trailer,
  34139: TITLED.playlist,
  39701: TITLED.bookmark,
  33331: TITLED.threeDObject,
};

/** Postfix that replaces the default pattern (e.g. "npanel app" instead of "npanel software app"). */
const KIND_POSTFIXES: Partial<Record<number, MessageDescriptor>> = {
  32267: TITLED.app,
  30063: TITLED.softwareRelease,
  3063: TITLED.softwareAsset,
};

/** Get a display name for an event based on its kind and tags. */
function getEventDisplayName(intl: IntlShape, event: NostrEvent): { text: string; icon?: React.ComponentType<{ className?: string }> } {
  const icon = KIND_ICONS[event.kind];

  // Nsite deployments: "{siteName} nsite" with rocket icon. Snapshots read
  // as "{siteName} nsite snapshot" so the version is distinguishable from the
  // living site it was taken from.
  if (isNsiteKind(event.kind)) {
    const snapshot = event.kind === NSITE_SNAPSHOT_KIND;
    const title = event.tags.find(([name]) => name === 'title')?.[1];
    const dTag = event.tags.find(([name]) => name === 'd')?.[1];
    const siteName = title || dTag;
    const text = siteName
      ? intl.formatMessage(snapshot ? TITLED.nsiteSnapshot : TITLED.nsite, { title: siteName })
      : intl.formatMessage(snapshot ? KIND_LABEL.nsiteSnapshot : KIND_LABEL.nsite);
    return { text, icon };
  }

  // NIP-89 apps: name lives in JSON content, not in tags
  if (event.kind === 31990) {
    try {
      const meta = JSON.parse(event.content);
      const appName = meta?.name || event.tags.find(([n]) => n === 'name')?.[1];
      if (appName) return { text: intl.formatMessage(TITLED.app, { title: appName }), icon };
    } catch { /* fall through */ }
    return { text: intl.formatMessage(KIND_LABEL.app), icon };
  }

  // Extract a title-like string from tags
  const title = event.tags.find(([name]) => name === 'title')?.[1];
  const name = event.tags.find(([name]) => name === 'name')?.[1];
  const dTag = event.tags.find(([name]) => name === 'd')?.[1];
  const alt = event.tags.find(([name]) => name === 'alt')?.[1]?.trim();
  const displayTitle = title || name || dTag;

  // Kinds with a custom postfix (e.g. "npanel app")
  const postfix = KIND_POSTFIXES[event.kind];
  if (postfix && displayTitle) {
    return { text: intl.formatMessage(postfix, { title: displayTitle }), icon };
  }

  // Kinds with a suffix (e.g. "Beagle Owner badge", "Wet Dry World theme")
  const suffix = KIND_SUFFIXES[event.kind];
  if (suffix && displayTitle) {
    return { text: intl.formatMessage(suffix, { title: displayTitle }), icon };
  }

  // Known kinds: use the conventional title/name/d tag if available.
  if (KIND_LABELS[event.kind] && displayTitle) {
    return { text: displayTitle, icon };
  }

  // Unknown kinds: only trust the NIP-31 `alt` tag. title/name/d have
  // kind-specific semantics we can't interpret; `d` in particular is often
  // an opaque compound identifier.
  if (alt) return { text: alt, icon };

  // Fall back to kind label ("an unsupported event" for unknown kinds).
  return { text: getKindLabel(intl, event.kind), icon };
}

/** Build a navigation link for the root event. */
function getRootLink(event: NostrEvent): string {
  if (event.kind >= 30000 && event.kind < 40000) {
    const dTag = event.tags.find(([name]) => name === 'd')?.[1];
    if (dTag) {
      return `/${nip19.naddrEncode({ kind: event.kind, pubkey: event.pubkey, identifier: dTag })}`;
    }
  }
  return `/${nip19.neventEncode({ id: event.id, author: event.pubkey })}`;
}

// ─── Shared wrapper ────────────────────────────────────────────

interface CommentContextRowProps {
  /** Lead-in text. Defaults to "Commenting on". */
  prefix?: ReactNode;
  className?: string;
  loading?: boolean;
  children?: ReactNode;
}

/** Shared row wrapper for all comment context variants. */
function CommentContextRow({ prefix, className, loading, children }: CommentContextRowProps) {
  return (
    <div className={className || ROW_CLASS}>
      <span className="shrink-0">
        {prefix ?? <FormattedMessage id="commentContext.commentingOn" defaultMessage="Commenting on" />}
      </span>
      {loading ? <Skeleton className="h-3.5 w-24 inline-block" /> : children}
    </div>
  );
}

// ─── Shared hover card for Nostr events ────────────────────────

interface EventHoverLinkProps {
  display: { text: string; icon?: React.ComponentType<{ className?: string }> };
  link: string;
  hoverContent: ReactNode;
}

/** Link with icon that shows a hover card preview. */
function EventHoverLink({ display, link, hoverContent }: EventHoverLinkProps) {
  const DisplayIcon = display.icon;
  return (
    <HoverCard openDelay={300} closeDelay={150}>
      <HoverCardTrigger asChild>
        <Link
          to={link}
          className="inline-flex items-center gap-1 text-primary hover:underline truncate cursor-pointer"
          onClick={(e) => e.stopPropagation()}
        >
          {DisplayIcon && <DisplayIcon className="size-3.5 shrink-0" />}
          {display.text}
        </Link>
      </HoverCardTrigger>
      <HoverCardContent
        side="bottom"
        align="start"
        sideOffset={4}
        className="w-80 p-0 rounded-2xl shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {hoverContent}
      </HoverCardContent>
    </HoverCard>
  );
}

// ─── Main export ───────────────────────────────────────────────

interface CommentContextProps {
  event: NostrEvent;
  className?: string;
}

/**
 * Parent kinds that read as a conversation rather than a comment on some other
 * object: text notes, NIP-22 comments, and voice messages. A comment whose
 * parent is one of these shows "Replying to @user" instead of "Commenting on".
 */
const REPLY_PARENT_KINDS = new Set(['1', '11', '1111', '1222', '1244']);

/** One of a comment's two scopes: the item it replies to, or the thread root. */
interface CommentScope {
  /** Kind of the referenced item, as written in the `k`/`K` tag. */
  kind?: string;
  /** Author of the referenced item, validated as hex. */
  pubkey?: string;
  /** Id of the referenced event, validated as hex. */
  eventId?: string;
  relayHint?: string;
}

/**
 * Read one of a comment's scopes: `parent` from the lowercase tags, `root`
 * from the uppercase ones.
 *
 * NIP-22 records the author both at position [3] of the `e` tag and in a `p`
 * tag — but `p` tags also carry NIP-21 mentions, so prefer the unambiguous `e`
 * hint and fall back to the FIRST `p` tag, since the reply scope is tagged
 * ahead of any mentions.
 */
function readCommentScope(event: NostrEvent, scope: 'parent' | 'root'): CommentScope | undefined {
  const [eName, kName, pName] = scope === 'root' ? ['E', 'K', 'P'] : ['e', 'k', 'p'];

  const eTag = event.tags.find(([name]) => name === eName);
  const kind = event.tags.find(([name]) => name === kName)?.[1];
  if (!eTag && !kind) return undefined;

  const hinted = eTag?.[3];
  const tagged = event.tags.find(([name]) => name === pName)?.[1];
  const id = eTag?.[1];

  return {
    kind,
    pubkey: isNostrId(hinted) ? hinted : isNostrId(tagged) ? tagged : undefined,
    eventId: isNostrId(id) ? id : undefined,
    relayHint: eTag?.[2] || undefined,
  };
}

/**
 * Displays "Replying to @user" or "Commenting on [name]" context for kind 1111 comments.
 * When the parent item (lowercase k tag) is a note, comment, or voice message, shows
 * the same "Replying to @user" row a kind 1 reply gets. Otherwise shows
 * "Commenting on [root]".
 */
export function CommentContext({ event, className }: CommentContextProps) {
  // Some clients write only the uppercase scope on a top-level comment. It
  // names the same item as the missing lowercase one, so read it instead.
  const parent = readCommentScope(event, 'parent') ?? readCommentScope(event, 'root');

  if (parent?.kind && REPLY_PARENT_KINDS.has(parent.kind)) {
    return <ConversationReplyContext event={event} parent={parent} className={className} />;
  }

  const root = parseCommentRoot(event);

  if (!root) return null;

  switch (root.type) {
    case 'addr':
      return <AddrCommentContext root={root} className={className} />;
    case 'event':
      return <EventCommentContext root={root} className={className} />;
    case 'external':
      return <ExternalCommentContext root={root} className={className} />;
    default:
      return null;
  }
}

// ─── Sub-components ────────────────────────────────────────────

/**
 * Context row for a comment whose parent is part of a conversation — a note,
 * another comment, or a voice message.
 *
 * Renders the very same `ReplyContext` that kind 1 replies use, so a reply
 * reads identically whichever protocol carried it: the "Replying to" label
 * previews the parent post on hover, and each author is a profile link with a
 * profile hover card. The authors are the parent's and, when the thread runs
 * deeper, the root's — the NIP-22 counterpart of the participant `p` tags a
 * NIP-10 reply lists.
 */
function ConversationReplyContext({ event, parent, className }: {
  event: NostrEvent;
  parent: CommentScope;
  className?: string;
}) {
  // Some clients tag neither the author nor a pubkey hint. Rather than drop
  // the names, fetch the parent and read its author — the comment is already
  // rendered, so this only fills in the row.
  const { data: parentEvent } = useEvent(
    parent.pubkey ? undefined : parent.eventId,
    parent.relayHint ? [parent.relayHint] : undefined,
  );
  const parentPubkey = parent.pubkey ?? parentEvent?.pubkey;

  const root = readCommentScope(event, 'root');
  const pubkeys = [parentPubkey, root?.pubkey]
    .filter((pubkey): pubkey is string => !!pubkey)
    .filter((pubkey, index, all) => all.indexOf(pubkey) === index);

  return (
    <ReplyContext
      pubkeys={pubkeys}
      parentEventId={parent.eventId}
      parentRelayHint={parent.relayHint}
      parentAuthorHint={parentPubkey}
      className={className}
    />
  );
}

/** Comment context for addressable event roots (A tag). */
function AddrCommentContext({ root, className }: { root: CommentRoot; className?: string }) {
  // Kind 0 (profile) roots get special treatment — show "@DisplayName" with a profile link
  if (root.addr?.kind === 0) {
    return <ProfileCommentContext pubkey={root.addr.pubkey} className={className} />;
  }

  // Kind 10008, or legacy kind 30008 with d=profile_badges → NIP-58 profile
  // badges. Kind 30008 with any other d is a NIP-51 badge set (handled by
  // the generic addr context, which fetches the event and uses its title).
  if (
    root.addr?.kind === 10008 ||
    (root.addr?.kind === 30008 && root.addr.identifier === 'profile_badges')
  ) {
    return <ProfileBadgesCommentContext root={root} className={className} />;
  }

  // Kind 3 follow lists have no title of their own — synthesize one from the author's name
  if (root.addr?.kind === 3) {
    return (
      <AuthorListCommentContext
        pubkey={root.addr.pubkey}
        kind={3}
        icon={UserCheck}
        noun={<FormattedMessage id="commentContext.followListNoun" defaultMessage="follow list" />}
        className={className}
      />
    );
  }

  // Kind 10002 relay lists likewise carry no title — only `r` tags.
  if (root.addr?.kind === 10002) {
    return (
      <AuthorListCommentContext
        pubkey={root.addr.pubkey}
        kind={10002}
        icon={Server}
        noun={<FormattedMessage id="relayList.commentContextNoun" defaultMessage="relay list" />}
        className={className}
      />
    );
  }

  // Kind 10011 external identities (NIP-39) — only `i` tags.
  if (root.addr?.kind === 10011) {
    return (
      <AuthorListCommentContext
        pubkey={root.addr.pubkey}
        kind={10011}
        icon={Link2}
        noun={<FormattedMessage id="externalIdentities.commentContextNoun" defaultMessage="linked accounts" />}
        className={className}
      />
    );
  }

  // Kind 33863 fundraisers: attribute to the campaign owner so the row
  // reads "Commenting on @Alice's fundraiser" instead of falling
  // through to the generic title path.
  if (root.addr?.kind === 33863) {
    return <CampaignCommentContext root={root} className={className} />;
  }

  return <GenericAddrCommentContext root={root} className={className} />;
}

/**
 * Comment context for replaceable list kinds that carry no title of their own —
 * kind 3 follow lists, kind 10002 relay lists, and kind 10011 linked accounts. Shows "Commenting on
 * @Name's follow list", attributing the list to its author instead of falling
 * through to the generic title path (which would find nothing to show).
 */
function AuthorListCommentContext({ pubkey, kind, icon: Icon, noun, className }: {
  pubkey: string;
  kind: number;
  icon: React.ComponentType<{ className?: string }>;
  noun: React.ReactNode;
  className?: string;
}) {
  const intl = useIntl();
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
  const displayName = metadata?.name ?? metadata?.display_name ?? intl.formatMessage({ id: 'common.anonymous', defaultMessage: 'Anonymous' });
  const npubEncoded = useMemo(() => nip19.npubEncode(pubkey), [pubkey]);
  const listLink = useMemo(
    () => `/${nip19.naddrEncode({ kind, pubkey, identifier: '' })}`,
    [kind, pubkey],
  );

  return (
    <CommentContextRow className={className} loading={author.isLoading}>
      <ProfileHoverCard pubkey={pubkey} asChild>
        <Link
          to={`/${npubEncoded}`}
          className="text-primary hover:underline truncate"
          onClick={(e) => e.stopPropagation()}
        >
          <FormattedMessage
            id="commentContext.possessive"
            defaultMessage="@{name}'s"
            values={{ name: <EmojifiedText tags={author.data?.event?.tags ?? []}>{displayName}</EmojifiedText> }}
          />
        </Link>
      </ProfileHoverCard>
      <Link
        to={listLink}
        className="inline-flex items-center gap-1 text-primary hover:underline shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <Icon className="size-3.5 shrink-0" />
        {noun}
      </Link>
    </CommentContextRow>
  );
}

/** Comment context for kind 0 (profile) roots — shows "Commenting on @Name". */
function ProfileCommentContext({ pubkey, className }: { pubkey: string; className?: string }) {
  const intl = useIntl();
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
  const displayName = metadata?.name ?? metadata?.display_name ?? intl.formatMessage({ id: 'common.anonymous', defaultMessage: 'Anonymous' });
  const npubEncoded = useMemo(() => nip19.npubEncode(pubkey), [pubkey]);

  return (
    <CommentContextRow className={className} loading={author.isLoading}>
      <ProfileHoverCard pubkey={pubkey} asChild>
        <Link
          to={`/${npubEncoded}`}
          className="text-primary hover:underline truncate"
          onClick={(e) => e.stopPropagation()}
        >
          @<EmojifiedText tags={author.data?.event?.tags ?? []}>{displayName}</EmojifiedText>
        </Link>
      </ProfileHoverCard>
    </CommentContextRow>
  );
}

/** Comment context for kind 10008/30008 (profile badges) roots — shows "Commenting on profile badges by @User". */
function ProfileBadgesCommentContext({ root, className }: { root: CommentRoot; className?: string }) {
  const intl = useIntl();
  const pubkey = root.addr?.pubkey ?? '';
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
  const displayName = metadata?.name ?? metadata?.display_name ?? intl.formatMessage({ id: 'common.anonymous', defaultMessage: 'Anonymous' });
  const npubEncoded = useMemo(() => nip19.npubEncode(pubkey), [pubkey]);

  // Build naddr link for the profile badges event
  const link = useMemo(() => {
    if (!root.addr) return undefined;
    try { return `/${nip19.naddrEncode({ kind: root.addr.kind, pubkey: root.addr.pubkey, identifier: root.addr.identifier })}`; } catch { return undefined; }
  }, [root.addr]);

  // Hover content for the addressable event
  const hoverContent = root.addr ? (
    <EmbeddedNaddr
      addr={{ kind: root.addr.kind, pubkey: root.addr.pubkey, identifier: root.addr.identifier }}
      className="border-0 rounded-none"
    />
  ) : undefined;

  return (
    <CommentContextRow className={className} loading={author.isLoading}>
      {link && hoverContent ? (
        <EventHoverLink
          display={{ text: intl.formatMessage(KIND_LABEL.profileBadges), icon: Award }}
          link={link}
          hoverContent={hoverContent}
        />
      ) : (
        <span className="inline-flex items-center gap-1 truncate">
          <Award className="size-3.5 shrink-0" />
          <FormattedMessage {...KIND_LABEL.profileBadges} />
        </span>
      )}
      <span className="shrink-0"><FormattedMessage id="commentContext.by" defaultMessage="by" /></span>
      <ProfileHoverCard pubkey={pubkey} asChild>
        <Link
          to={`/${npubEncoded}`}
          className="text-primary hover:underline truncate"
          onClick={(e) => e.stopPropagation()}
        >
          @<EmojifiedText tags={author.data?.event?.tags ?? []}>{displayName}</EmojifiedText>
        </Link>
      </ProfileHoverCard>
    </CommentContextRow>
  );
}

/** Comment context for non-profile addressable event roots (A tag). */
function GenericAddrCommentContext({ root, className }: { root: CommentRoot; className?: string }) {
  const intl = useIntl();
  const { data: event, isLoading } = useAddrEvent(root.addr, root.relayHint ? [root.relayHint] : undefined);

  const isCommunity = root.rootKind === '34550' || root.addr?.kind === 34550;
  const prefix = isCommunity
    ? <FormattedMessage id="commentContext.postedIn" defaultMessage="Posted in" />
    : undefined;

  const display = event ? getEventDisplayName(intl, event) : { text: getRootKindLabel(intl, root.rootKind) };
  const link = event ? getRootLink(event) : undefined;

  // Build hover card content for addressable events
  const hoverContent = root.addr ? (
    <EmbeddedNaddr
      addr={{ kind: root.addr.kind, pubkey: root.addr.pubkey, identifier: root.addr.identifier }}
      className="border-0 rounded-none"
    />
  ) : undefined;

  return (
    <CommentContextRow prefix={prefix} className={className} loading={isLoading}>
      {link && hoverContent ? (
        <EventHoverLink display={display} link={link} hoverContent={hoverContent} />
      ) : link ? (
        <Link
          to={link}
          className="inline-flex items-center gap-1 text-primary hover:underline truncate"
          onClick={(e) => e.stopPropagation()}
        >
          {display.icon && <display.icon className="size-3.5 shrink-0" />}
          {display.text}
        </Link>
      ) : (
        <span className="truncate">{display.text}</span>
      )}
    </CommentContextRow>
  );
}

/** Comment context for regular event roots (E tag). */
function EventCommentContext({ root, className }: { root: CommentRoot; className?: string }) {
  const intl = useIntl();
  const { data: event, isLoading } = useEvent(
    root.eventId,
    root.relayHint ? [root.relayHint] : undefined,
    root.authorHint,
  );

  // Kind 7 reactions get special treatment
  if (event?.kind === 7) {
    return <ReactionCommentContext event={event} className={className} />;
  }

  // Kind 1018 poll votes get special treatment
  if (event?.kind === 1018) {
    return <PollVoteCommentContext event={event} className={className} />;
  }

  // Kind 9735 Lightning / kind 8333 on-chain zaps get special treatment so
  // the row reads "Commenting on $100 zap by Alex Gleason" instead of
  // falling through to the generic display-name path, which has nothing
  // useful for a zap and ends up rendering the NIP-31 `alt` tag
  // ("Bitcoin zap: 127,897 sats" or similar — sender-less and verbose).
  if (event?.kind === 9735 || event?.kind === 8333) {
    return <ZapCommentContext event={event} className={className} />;
  }

  // Kind 9802 highlights: attribute the highlight to its author
  // ("Commenting on @Sebastix's highlight") instead of the generic
  // "Commenting on a highlight" fallback.
  if (event?.kind === 9802) {
    return <HighlightCommentContext event={event} className={className} />;
  }

  const display = event ? getEventDisplayName(intl, event) : { text: getRootKindLabel(intl, root.rootKind) };
  const link = event ? getRootLink(event) : undefined;

  const hoverContent = root.eventId ? (
    <EmbeddedNote
      eventId={root.eventId}
      relays={root.relayHint ? [root.relayHint] : undefined}
      authorHint={root.authorHint}
      className="border-0 rounded-none"
      disableHoverCards
    />
  ) : undefined;

  return (
    <CommentContextRow className={className} loading={isLoading}>
      {link && hoverContent ? (
        <EventHoverLink display={display} link={link} hoverContent={hoverContent} />
      ) : (
        <span className="truncate">{display.text}</span>
      )}
    </CommentContextRow>
  );
}

/** Comment context for kind 7 reaction roots — shows "Commenting on {emoji} by @{name}". */
function ReactionCommentContext({ event, className }: { event: NostrEvent; className?: string }) {
  const author = useAuthor(event.pubkey);
  const metadata = author.data?.metadata;
  const displayName = getDisplayName(metadata, event.pubkey);
  const reactionLink = getRootLink(event);
  const profileLink = `/${nip19.npubEncode(event.pubkey)}`;

  return (
    <CommentContextRow className={className}>
      <Link
        to={reactionLink}
        className="text-primary hover:underline shrink-0 cursor-pointer"
        onClick={(e) => e.stopPropagation()}
      >
        <ReactionEmoji content={event.content} tags={event.tags} pubkey={event.pubkey} className="inline-block h-[1.2em] w-[1.2em] align-text-bottom object-contain" />
      </Link>
      <span className="shrink-0"><FormattedMessage id="commentContext.by" defaultMessage="by" /></span>
      {author.isLoading ? (
        <Skeleton className="h-3.5 w-16 inline-block" />
      ) : (
        <ProfileHoverCard pubkey={event.pubkey} asChild>
          <Link
            to={profileLink}
            className="text-primary hover:underline truncate cursor-pointer"
            onClick={(e) => e.stopPropagation()}
          >
            @<EmojifiedText tags={author.data?.event?.tags ?? []}>{displayName}</EmojifiedText>
          </Link>
        </ProfileHoverCard>
      )}
    </CommentContextRow>
  );
}

/**
 * Comment context for kind 9735 Lightning / kind 8333 on-chain zap roots —
 * shows "Commenting on {amount} zap by @{sender}". Without this branch the
 * row falls through to the generic display-name path, which has no useful
 * title/name for a zap and ends up showing the NIP-31 `alt` tag (e.g.
 * "Bitcoin zap: 127,897 sats") — sender-less and verbose.
 *
 * `getZapAmountSats` / `getZapSenderPubkey` handle both kinds: kind 8333
 * `amount` is sats and sender is `event.pubkey`; kind 9735 amount falls
 * through (amount tag → description amount → bolt11) and sender comes from
 * the P tag / description JSON.
 */
function ZapCommentContext({ event, className }: { event: NostrEvent; className?: string }) {
  const sats = useMemo(() => getZapAmountSats(event), [event]);
  const senderPubkey = useMemo(() => getZapSenderPubkey(event), [event]);
  const { format: formatMoney } = useFormatMoney();

  const author = useAuthor(senderPubkey || undefined);
  const metadata = author.data?.metadata;
  const senderName = getDisplayName(metadata, senderPubkey);
  const zapLink = getRootLink(event);
  const profileLink = useMemo(() => {
    if (!isNostrId(senderPubkey)) return undefined;
    try { return `/${nip19.npubEncode(senderPubkey)}`; } catch { return undefined; }
  }, [senderPubkey]);

  // Amount link styled the same as the reaction emoji link — links to the
  // zap event itself so a click drills into the receipt.
  const amountNode = (
    <Link
      to={zapLink}
      className="inline-flex items-center gap-1 text-primary hover:underline shrink-0 cursor-pointer"
      onClick={(e) => e.stopPropagation()}
    >
      <Zap className="size-3.5 shrink-0 text-amber-500" />
      <span>
        {sats > 0
          ? <FormattedMessage id="commentContext.zapAmount" defaultMessage="{amount} zap" values={{ amount: formatMoney(sats) }} />
          : <FormattedMessage id="commentContext.zap" defaultMessage="zap" />}
      </span>
    </Link>
  );

  return (
    <CommentContextRow className={className}>
      {amountNode}
      {profileLink && (
        <>
          <span className="shrink-0"><FormattedMessage id="commentContext.by" defaultMessage="by" /></span>
          {author.isLoading ? (
            <Skeleton className="h-3.5 w-16 inline-block" />
          ) : (
            <ProfileHoverCard pubkey={senderPubkey} asChild>
              <Link
                to={profileLink}
                className="text-primary hover:underline truncate cursor-pointer"
                onClick={(e) => e.stopPropagation()}
              >
                @<EmojifiedText tags={author.data?.event?.tags ?? []}>{senderName}</EmojifiedText>
              </Link>
            </ProfileHoverCard>
          )}
        </>
      )}
    </CommentContextRow>
  );
}

/**
 * Comment context for kind 9802 NIP-84 highlight roots — shows
 * "Commenting on @{name}'s highlight". Names the highlight's author so a
 * thread on a highlight reads coherently, and gives the highlight noun a
 * hover-card preview of the excerpt (via EmbeddedNote → EmbeddedHighlightCard).
 */
function HighlightCommentContext({ event, className }: { event: NostrEvent; className?: string }) {
  const intl = useIntl();
  const author = useAuthor(event.pubkey);
  const metadata = author.data?.metadata;
  const displayName = getDisplayName(metadata, event.pubkey);
  const highlightLink = getRootLink(event);
  const profileLink = `/${nip19.npubEncode(event.pubkey)}`;

  const hoverContent = (
    <EmbeddedNote
      eventId={event.id}
      authorHint={event.pubkey}
      className="border-0 rounded-none"
      disableHoverCards
    />
  );

  return (
    <CommentContextRow className={className} loading={author.isLoading}>
      <ProfileHoverCard pubkey={event.pubkey} asChild>
        <Link
          to={profileLink}
          className="text-primary hover:underline truncate"
          onClick={(e) => e.stopPropagation()}
        >
          <FormattedMessage
            id="commentContext.possessive"
            defaultMessage="@{name}'s"
            values={{ name: <EmojifiedText tags={author.data?.event?.tags ?? []}>{displayName}</EmojifiedText> }}
          />
        </Link>
      </ProfileHoverCard>
      <EventHoverLink
        display={{ text: intl.formatMessage({ id: 'commentContext.highlightNoun', defaultMessage: 'highlight' }) }}
        link={highlightLink}
        hoverContent={hoverContent}
      />
    </CommentContextRow>
  );
}

/**
 * Comment context for kind 33863 Fundraiser/Campaign roots — shows
 * "Commenting on @{name}'s fundraiser". Names the campaign owner so a
 * thread on a fundraiser reads coherently, and gives the fundraiser
 * noun a hover-card preview of the campaign (via EmbeddedNaddr →
 * EmbeddedCampaignCard).
 */
function CampaignCommentContext({ root, className }: { root: CommentRoot; className?: string }) {
  const intl = useIntl();
  const pubkey = root.addr?.pubkey ?? '';
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
  const displayName = getDisplayName(metadata, pubkey);
  const profileLink = useMemo(() => {
    if (!pubkey) return undefined;
    try { return `/${nip19.npubEncode(pubkey)}`; } catch { return undefined; }
  }, [pubkey]);

  // Build naddr link for the campaign itself.
  const campaignLink = useMemo(() => {
    if (!root.addr) return undefined;
    try {
      return `/${nip19.naddrEncode({ kind: root.addr.kind, pubkey: root.addr.pubkey, identifier: root.addr.identifier })}`;
    } catch {
      return undefined;
    }
  }, [root.addr]);

  const hoverContent = root.addr ? (
    <EmbeddedNaddr
      addr={{ kind: root.addr.kind, pubkey: root.addr.pubkey, identifier: root.addr.identifier }}
      className="border-0 rounded-none"
    />
  ) : undefined;

  return (
    <CommentContextRow className={className} loading={author.isLoading}>
      {profileLink ? (
        <ProfileHoverCard pubkey={pubkey} asChild>
          <Link
            to={profileLink}
          className="text-primary hover:underline truncate"
          onClick={(e) => e.stopPropagation()}
        >
          @<EmojifiedText tags={author.data?.event?.tags ?? []}>{displayName}</EmojifiedText>
        </Link>
        </ProfileHoverCard>
      ) : (
        <span className="truncate">
          <FormattedMessage
            id="commentContext.possessive"
            defaultMessage="@{name}'s"
            values={{ name: <EmojifiedText tags={author.data?.event?.tags ?? []}>{displayName}</EmojifiedText> }}
          />
        </span>
      )}
      {campaignLink && hoverContent ? (
        <EventHoverLink
          display={{ text: intl.formatMessage({ id: 'commentContext.fundraiserNoun', defaultMessage: 'fundraiser' }), icon: HandHeart }}
          link={campaignLink}
          hoverContent={hoverContent}
        />
      ) : (
        <span className="inline-flex items-center gap-1 truncate">
          <HandHeart className="size-3.5 shrink-0" />
          <FormattedMessage id="commentContext.fundraiserNoun" defaultMessage="fundraiser" />
        </span>
      )}
    </CommentContextRow>
  );
}

/** Comment context for kind 1018 poll vote roots — shows "Commenting on @{name}'s vote for {option}". */
function PollVoteCommentContext({ event, className }: { event: NostrEvent; className?: string }) {
  const author = useAuthor(event.pubkey);
  const metadata = author.data?.metadata;
  const displayName = getDisplayName(metadata, event.pubkey);
  const voteLink = getRootLink(event);
  const profileLink = `/${nip19.npubEncode(event.pubkey)}`;

  const voteLabel = usePollVoteLabel(event);

  return (
    <CommentContextRow className={className}>
      {author.isLoading ? (
        <Skeleton className="h-3.5 w-16 inline-block" />
      ) : (
        <ProfileHoverCard pubkey={event.pubkey} asChild>
          <Link
            to={profileLink}
            className="text-primary hover:underline truncate cursor-pointer"
            onClick={(e) => e.stopPropagation()}
          >
            @<EmojifiedText tags={author.data?.event?.tags ?? []}>{displayName}</EmojifiedText>
          </Link>
        </ProfileHoverCard>
      )}
      <Link
        to={voteLink}
        className="inline-flex items-center gap-1 text-primary hover:underline truncate cursor-pointer"
        onClick={(e) => e.stopPropagation()}
      >
        <Vote className="size-3.5 shrink-0" />
        {voteLabel
          ? <FormattedMessage id="commentContext.voteFor" defaultMessage="vote for {option}" values={{ option: voteLabel }} />
          : <FormattedMessage id="commentContext.vote" defaultMessage="vote" />}
      </Link>
    </CommentContextRow>
  );
}

/** Comment context for external content roots (I tag). */
function ExternalCommentContext({ root, className }: { root: CommentRoot; className?: string }) {
  const identifier = root.identifier ?? '';

  // ISBN identifiers get special treatment — show book title instead of raw ISBN
  if (identifier.startsWith('isbn:')) {
    return <IsbnCommentContext identifier={identifier} className={className} />;
  }

  // URL identifiers get special treatment — show page title with favicon.
  // Gatherer URLs are routed to a Scryfall-backed renderer that shows the
  // actual card name instead of the raw URL.
  if (identifier.startsWith('http://') || identifier.startsWith('https://')) {
    const gathererCard = extractGathererCard(identifier);
    if (gathererCard) {
      return <GathererCardCommentContext card={gathererCard} url={identifier} className={className} />;
    }
    return <UrlCommentContext url={identifier} className={className} />;
  }

  // ISO 3166 country/subdivision identifiers get special treatment
  if (identifier.startsWith('iso3166:')) {
    return <CountryCommentContext identifier={identifier} className={className} />;
  }

  // Bitcoin transaction identifiers — show icon + truncated txid with hover preview
  if (identifier.startsWith('bitcoin:tx:')) {
    return <BitcoinTxCommentContext identifier={identifier} className={className} />;
  }

  // Bitcoin address identifiers — show icon + truncated address with hover preview
  if (identifier.startsWith('bitcoin:address:')) {
    return <BitcoinAddressCommentContext identifier={identifier} className={className} />;
  }

  // Generic fallback for other external identifiers
  const link = `/i/${encodeURIComponent(identifier)}`;

  return (
    <CommentContextRow className={className}>
      <Link
        to={link}
        className="text-primary hover:underline truncate"
        onClick={(e) => e.stopPropagation()}
      >
        {identifier}
      </Link>
    </CommentContextRow>
  );
}

/** Comment context for URL identifiers — fetches and displays the page title with favicon. */
function UrlCommentContext({ url, className }: { url: string; className?: string }) {
  const { data: preview, isLoading } = useLinkPreview(url);
  const link = `/i/${encodeURIComponent(url)}`;

  let fallbackHost: string;
  try {
    fallbackHost = new URL(url).hostname.replace(/^www\./, '');
  } catch {
    fallbackHost = url;
  }

  const title = preview?.title;

  return (
    <CommentContextRow className={className} loading={isLoading}>
      <ExternalFavicon url={url} size={14} className="shrink-0" />
      <HoverCard openDelay={300} closeDelay={150}>
        <HoverCardTrigger asChild>
          <Link
            to={link}
            className="text-primary hover:underline truncate cursor-pointer"
            onClick={(e) => e.stopPropagation()}
          >
            {title || fallbackHost}
          </Link>
        </HoverCardTrigger>
        <HoverCardContent
          side="bottom"
          align="start"
          sideOffset={4}
          className="w-80 p-0 rounded-2xl shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <LinkPreview url={url} className="border-0 rounded-none" navigateToComments />
        </HoverCardContent>
      </HoverCard>
    </CommentContextRow>
  );
}

/** Comment context for ISO 3166 country/subdivision identifiers — shows flag and name with hover preview. */
function CountryCommentContext({ identifier, className }: { identifier: string; className?: string }) {
  const intl = useIntl();
  const code = identifier.slice('iso3166:'.length);
  const info = getCountryInfo(code, intl);
  const link = `/i/${encodeURIComponent(identifier)}`;

  const displayText = info
    ? info.subdivisionName
      ? `${info.flag} ${info.subdivisionName}`
      : `${info.flag} ${info.name}`
    : identifier;

  return (
    <CommentContextRow className={className}>
      <HoverCard openDelay={300} closeDelay={150}>
        <HoverCardTrigger asChild>
          <Link
            to={link}
            className="text-primary hover:underline truncate cursor-pointer"
            onClick={(e) => e.stopPropagation()}
          >
            {displayText}
          </Link>
        </HoverCardTrigger>
        <HoverCardContent
          side="bottom"
          align="start"
          sideOffset={4}
          className="w-64 p-0 rounded-2xl shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-3 px-4 py-3">
            <span className="text-2xl leading-none shrink-0" role="img" aria-label={info ? intl.formatMessage({ id: 'commentContext.flagOf', defaultMessage: 'Flag of {country}' }, { country: info.name }) : code}>
              {info?.flag ?? '🌍'}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <MapPin className="size-3 shrink-0" />
                <span>
                  {info?.subdivisionName
                    ? <FormattedMessage id="commentContext.region" defaultMessage="Region" />
                    : <FormattedMessage id="commentContext.country" defaultMessage="Country" />}
                </span>
              </div>
              <p className="text-sm font-medium truncate mt-0.5">
                {info?.subdivisionName ?? info?.name ?? code}
              </p>
              {info?.subdivisionName && info.name && (
                <p className="text-xs text-muted-foreground truncate">
                  {info.name}
                </p>
              )}
            </div>
          </div>
        </HoverCardContent>
      </HoverCard>
    </CommentContextRow>
  );
}

/** Comment context for ISBN identifiers — fetches and displays the book title with hover preview. */
function IsbnCommentContext({ identifier, className }: { identifier: string; className?: string }) {
  const intl = useIntl();
  const isbn = identifier.slice('isbn:'.length);
  const { data: bookInfo, isLoading } = useBookInfo(isbn);
  const link = `/i/${encodeURIComponent(identifier)}`;
  const displayText = bookInfo?.title ?? identifier;
  const coverUrl = bookInfo?.cover?.medium || bookInfo?.cover?.large;
  const authors = bookInfo?.authors?.map((a) => a.name).join(', ');

  return (
    <CommentContextRow className={className} loading={isLoading}>
      <HoverCard openDelay={300} closeDelay={150}>
        <HoverCardTrigger asChild>
          <Link
            to={link}
            className="inline-flex items-center gap-1 text-primary hover:underline truncate cursor-pointer"
            onClick={(e) => e.stopPropagation()}
          >
            <BookOpen className="size-3.5 shrink-0" />
            {displayText}
          </Link>
        </HoverCardTrigger>
        <HoverCardContent
          side="bottom"
          align="start"
          sideOffset={4}
          className="w-72 p-0 rounded-2xl shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-3 px-4 py-3">
            {coverUrl ? (
              <img
                src={coverUrl}
                alt={bookInfo?.title || intl.formatMessage({ id: 'commentContext.bookCover', defaultMessage: 'Book cover' })}
                className="w-9 h-12 rounded object-cover shrink-0"
                loading="lazy"
                decoding="async"
              />
            ) : (
              <div className="w-9 h-12 rounded bg-secondary flex items-center justify-center shrink-0">
                <BookOpen className="size-4 text-muted-foreground/40" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <BookOpen className="size-3 shrink-0" />
                <span><FormattedMessage id="commentContext.book" defaultMessage="Book" /></span>
              </div>
              <p className="text-sm font-medium truncate mt-0.5">
                {bookInfo?.title || `ISBN ${isbn}`}
              </p>
              {authors && (
                <p className="text-xs text-muted-foreground truncate">
                  <FormattedMessage id="commentContext.byAuthors" defaultMessage="by {authors}" values={{ authors }} />
                </p>
              )}
            </div>
          </div>
        </HoverCardContent>
      </HoverCard>
    </CommentContextRow>
  );
}

/**
 * Comment context for gatherer.wizards.com URLs — resolves the URL to a
 * Magic: The Gathering card via Scryfall and shows the card's real name
 * (e.g. "Xenagos, God of Revels") instead of the raw URL.
 */
function GathererCardCommentContext({
  card,
  url,
  className,
}: {
  card: GathererCard;
  url: string;
  className?: string;
}) {
  const lookup = useMemo(() => (
    card.kind === 'multiverse'
      ? { kind: 'multiverse' as const, multiverseId: card.multiverseId }
      : { kind: 'set' as const, set: card.set, number: card.number, lang: card.lang }
  ), [card]);
  const intl = useIntl();
  const { data: scryCard, isLoading } = useScryfallCard(lookup);
  const link = `/i/${encodeURIComponent(url)}`;

  const displayText = scryCard?.name ?? intl.formatMessage({ id: 'commentContext.magicCardFallback', defaultMessage: 'Magic card' });
  const coverUrl = scryCard ? cardPrimaryImage(scryCard, 'small') : undefined;

  return (
    <CommentContextRow className={className} loading={isLoading}>
      <HoverCard openDelay={300} closeDelay={150}>
        <HoverCardTrigger asChild>
          <Link
            to={link}
            className="inline-flex items-center gap-1 text-primary hover:underline truncate cursor-pointer"
            onClick={(e) => e.stopPropagation()}
          >
            <CardsIcon className="size-3.5 shrink-0" />
            {displayText}
          </Link>
        </HoverCardTrigger>
        <HoverCardContent
          side="bottom"
          align="start"
          sideOffset={4}
          className="w-72 p-0 rounded-2xl shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-3 px-4 py-3">
            {coverUrl ? (
              <img
                src={coverUrl}
                alt={displayText}
                className="w-9 h-12 rounded object-cover shrink-0"
                loading="lazy"
                decoding="async"
              />
            ) : (
              <div className="w-9 h-12 rounded bg-secondary flex items-center justify-center shrink-0">
                <CardsIcon className="size-4 text-muted-foreground/40" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <CardsIcon className="size-3 shrink-0" />
                <span><FormattedMessage id="commentContext.magicCardLabel" defaultMessage="Magic Card" /></span>
              </div>
              <p className="text-sm font-medium truncate mt-0.5">
                {scryCard?.name ?? <FormattedMessage id="commentContext.unknownCard" defaultMessage="Unknown card" />}
              </p>
              {scryCard?.set_name && (
                <p className="text-xs text-muted-foreground truncate">
                  {scryCard.set_name}
                </p>
              )}
            </div>
          </div>
        </HoverCardContent>
      </HoverCard>
    </CommentContextRow>
  );
}

/** Comment context for Bitcoin transaction identifiers — shows icon, truncated txid, and hover preview. */
function BitcoinTxCommentContext({ identifier, className }: { identifier: string; className?: string }) {
  const txid = identifier.slice('bitcoin:tx:'.length);
  const link = `/i/${encodeURIComponent(identifier)}`;
  const truncated = txid.length > 19 ? `${txid.slice(0, 8)}…${txid.slice(-8)}` : txid;

  return (
    <CommentContextRow className={className}>
      <Bitcoin className="size-3.5 shrink-0 text-orange-500" />
      <HoverCard openDelay={300} closeDelay={150}>
        <HoverCardTrigger asChild>
          <Link
            to={link}
            className="text-primary hover:underline truncate cursor-pointer"
            onClick={(e) => e.stopPropagation()}
          >
            <FormattedMessage
              id="commentContext.bitcoinTx"
              defaultMessage="transaction {txid}"
              values={{ txid: <span className="font-mono text-xs">{truncated}</span> }}
            />
          </Link>
        </HoverCardTrigger>
        <HoverCardContent
          side="bottom"
          align="start"
          sideOffset={4}
          className="w-80 p-0 rounded-2xl shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <BitcoinTxPreview txid={txid} link={link} />
        </HoverCardContent>
      </HoverCard>
    </CommentContextRow>
  );
}

/** Comment context for Bitcoin address identifiers — shows icon, truncated address, and hover preview. */
function BitcoinAddressCommentContext({ identifier, className }: { identifier: string; className?: string }) {
  const address = identifier.slice('bitcoin:address:'.length);
  const link = `/i/${encodeURIComponent(identifier)}`;
  const truncated = address.length > 19 ? `${address.slice(0, 8)}…${address.slice(-8)}` : address;

  return (
    <CommentContextRow className={className}>
      <Bitcoin className="size-3.5 shrink-0 text-orange-500" />
      <HoverCard openDelay={300} closeDelay={150}>
        <HoverCardTrigger asChild>
          <Link
            to={link}
            className="text-primary hover:underline truncate cursor-pointer"
            onClick={(e) => e.stopPropagation()}
          >
            <FormattedMessage
              id="commentContext.bitcoinAddress"
              defaultMessage="address {address}"
              values={{ address: <span className="font-mono text-xs">{truncated}</span> }}
            />
          </Link>
        </HoverCardTrigger>
        <HoverCardContent
          side="bottom"
          align="start"
          sideOffset={4}
          className="w-80 p-0 rounded-2xl shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <BitcoinAddressPreview address={address} link={link} />
        </HoverCardContent>
      </HoverCard>
    </CommentContextRow>
  );
}

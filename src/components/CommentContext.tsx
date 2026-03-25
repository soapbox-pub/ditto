import type React from 'react';
import { type ReactNode, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import {
  Award, BarChart3, BookOpen, Camera, Clapperboard, FileText, Film,
  GitBranch, GitPullRequest, MapPin, MessageSquare, Mic, Music,
  Package, Palette, PartyPopper, Podcast, Radio, Rocket, SmilePlus, Sparkles, Users,
} from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';

import { CardsIcon } from '@/components/icons/CardsIcon';
import { ChestIcon } from '@/components/icons/ChestIcon';
import { EmbeddedNote } from '@/components/EmbeddedNote';
import { EmbeddedNaddr } from '@/components/EmbeddedNaddr';
import { LinkPreview } from '@/components/LinkPreview';
import { ProfileHoverCard } from '@/components/ProfileHoverCard';
import { ReactionEmoji } from '@/components/CustomEmoji';
import { ExternalFavicon } from '@/components/ExternalFavicon';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAddrEvent, useEvent } from '@/hooks/useEvent';
import { useAuthor } from '@/hooks/useAuthor';
import { useBookInfo } from '@/hooks/useBookInfo';
import { useLinkPreview } from '@/hooks/useLinkPreview';
import { getDisplayName } from '@/lib/getDisplayName';
import { genUserName } from '@/lib/genUserName';
import { getCountryInfo } from '@/lib/countries';


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
}

/** Parse the root reference from a kind 1111 comment's tags. */
function parseCommentRoot(event: NostrEvent): CommentRoot | undefined {
  const aTag = event.tags.find(([name]) => name === 'A')?.[1];
  // Use find (not findLast) to get the root E tag, not a parent e tag
  const eTag = event.tags.find(([name]) => name === 'E')?.[1];
  const iTag = event.tags.find(([name]) => name === 'I')?.[1];
  const kTag = event.tags.find(([name]) => name === 'K')?.[1];

  if (aTag) {
    const parts = aTag.split(':');
    const kind = parseInt(parts[0], 10);
    const pubkey = parts[1] ?? '';
    const identifier = parts.slice(2).join(':');
    return { type: 'addr', addr: { kind, pubkey, identifier }, rootKind: kTag };
  }

  if (eTag) {
    return { type: 'event', eventId: eTag, rootKind: kTag };
  }

  if (iTag) {
    return { type: 'external', identifier: iTag, rootKind: kTag };
  }

  return undefined;
}

/**
 * Singular comment-context labels for every supported kind.
 * Must use singular form with article ("a post", "an article") since these
 * appear as "Commenting on {label}". EXTRA_KINDS labels are plural/categorical
 * ("Requests to Vanish", "User Statuses") and must NOT be used directly.
 */
const KIND_LABELS: Record<number, string> = {
  1: 'a post',
  6: 'a repost',
  7: 'a reaction',
  16: 'a repost',
  20: 'a photo',
  21: 'a video',
  22: 'a short video',
  62: 'a request to vanish',
  1063: 'a file',
  1068: 'a poll',
  1111: 'a comment',
  1222: 'a voice message',
  1617: 'a patch',
  1618: 'a pull request',
  3367: 'a color moment',
  7516: 'a found log',
  15128: 'an nsite',
  16767: 'a theme',
  30008: 'profile badges',
  30009: 'a badge',
  30023: 'an article',
  30030: 'an emoji pack',
  30054: 'a podcast episode',
  30055: 'a podcast trailer',
  30063: 'a release',
  30311: 'a stream',
  30315: 'a status',
  30617: 'a repository',
  30817: 'a custom NIP',
  31922: 'a calendar event',
  31923: 'a calendar event',
  32267: 'an app',
  34139: 'a playlist',
  34236: 'a vine',
  34550: 'a community',
  35128: 'an nsite',
  36767: 'a theme',
  36787: 'a track',
  37381: 'a Magic deck',
  37516: 'a geocache',
  39089: 'a follow pack',
};

/** Kind-specific icons — matches sidebar and NoteCard icons. */
const KIND_ICONS: Partial<Record<number, React.ComponentType<{ className?: string }>>> = {
  1: MessageSquare,
  20: Camera,
  21: Film,
  22: Film,
  1063: FileText,
  1068: BarChart3,
  1222: Mic,
  1617: FileText,
  1618: GitPullRequest,
  15128: Rocket,
  35128: Rocket,
  30008: Award,
  30009: Award,
  30023: BookOpen,
  30030: SmilePlus,
  30054: Podcast,
  30055: Podcast,
  30063: Package,
  30311: Radio,
  30617: GitBranch,
  32267: Package,
  34236: Clapperboard,
  36767: Sparkles,
  16767: Sparkles,
  36787: Music,
  34139: Music,
  37381: CardsIcon,
  37516: ChestIcon,
  7516: ChestIcon,
  39089: PartyPopper,
  3367: Palette,
};

/**
 * Get a singular comment-context label for a kind number.
 * Only uses KIND_LABELS (which has proper singular forms with articles).
 * Never falls through to EXTRA_KINDS labels since those are plural/categorical.
 */
function getKindLabel(kind: number): string {
  return KIND_LABELS[kind] ?? 'a post';
}

/** Parse a rootKind string into a label, handling both numeric and external content kinds. */
function getRootKindLabel(rootKind: string | undefined): string {
  if (!rootKind) return 'a post';

  const kindNum = parseInt(rootKind, 10);
  if (isNaN(kindNum)) {
    if (rootKind === 'web' || rootKind === 'https' || rootKind === 'http') return 'a link';
    if (rootKind === '#') return 'a hashtag';
    return rootKind;
  }

  return getKindLabel(kindNum);
}

/** Suffix that describes the kind, appended after a title (e.g. "Wet Dry World theme"). */
const KIND_SUFFIXES: Partial<Record<number, string>> = {
  30009: 'badge',
  30030: 'emoji pack',
  36767: 'theme',
  16767: 'theme',
  39089: 'follow pack',
  37381: 'deck',
  37516: 'geocache',
  34550: 'community',
  30054: 'episode',
  30055: 'trailer',
  34139: 'playlist',
};

/** Postfix that replaces the default pattern (e.g. "Ditto on Zapstore" instead of "Ditto app"). */
const KIND_POSTFIXES: Partial<Record<number, string>> = {
  32267: 'on Zapstore',
  30063: 'release',
};

/** Get a display name for an event based on its kind and tags. */
function getEventDisplayName(event: NostrEvent): { text: string; icon?: React.ComponentType<{ className?: string }> } {
  const icon = KIND_ICONS[event.kind];

  // Nsite deployments: "{siteName} nsite" with rocket icon
  if (event.kind === 15128 || event.kind === 35128) {
    const title = event.tags.find(([name]) => name === 'title')?.[1];
    const dTag = event.tags.find(([name]) => name === 'd')?.[1];
    const siteName = title || dTag;
    return { text: siteName ? `${siteName} nsite` : 'an nsite', icon };
  }

  // Extract a title-like string from tags
  const title = event.tags.find(([name]) => name === 'title')?.[1];
  const name = event.tags.find(([name]) => name === 'name')?.[1];
  const dTag = event.tags.find(([name]) => name === 'd')?.[1];
  const displayTitle = title || name || dTag;

  // Kinds with a custom postfix (e.g. "Ditto on Zapstore")
  const postfix = KIND_POSTFIXES[event.kind];
  if (postfix && displayTitle) {
    return { text: `${displayTitle} ${postfix}`, icon };
  }

  // Kinds with a suffix (e.g. "Beagle Owner badge", "Wet Dry World theme")
  const suffix = KIND_SUFFIXES[event.kind];
  if (suffix && displayTitle) {
    return { text: `${displayTitle} ${suffix}`, icon };
  }

  // Generic: just use the title if available
  if (displayTitle) return { text: displayTitle, icon };

  // Fall back to kind label
  return { text: getKindLabel(event.kind), icon };
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
  prefix: string;
  className?: string;
  loading?: boolean;
  children?: ReactNode;
}

/** Shared row wrapper for all comment context variants. */
function CommentContextRow({ prefix, className, loading, children }: CommentContextRowProps) {
  return (
    <div className={className || ROW_CLASS}>
      <span className="shrink-0">{prefix}</span>
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
 * Displays "Replying to @user" or "Commenting on [name]" context for kind 1111 comments.
 * When the parent item (lowercase k tag) is another kind 1111 comment, shows "Replying to @user"
 * using the lowercase p tag (parent author). Otherwise shows "Commenting on [root]".
 */
export function CommentContext({ event, className }: CommentContextProps) {
  // If the direct parent is another comment (k="1111"), show "Replying to @user"
  const parentKind = event.tags.find(([name]) => name === 'k')?.[1];
  const parentAuthorPubkey = event.tags.findLast(([name]) => name === 'p')?.[1];

  if (parentKind === '1111' && parentAuthorPubkey) {
    return <ReplyToCommentContext pubkey={parentAuthorPubkey} eventId={event.tags.findLast(([name]) => name === 'e')?.[1]} className={className} />;
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

/** Comment context when replying directly to another kind 1111 comment — shows "Replying to @user". */
function ReplyToCommentContext({ pubkey, eventId, className }: { pubkey: string; eventId?: string; className?: string }) {
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
  const displayName = metadata?.name ?? genUserName(pubkey);
  const npubEncoded = useMemo(() => nip19.npubEncode(pubkey), [pubkey]);
  const parentLink = useMemo(() => {
    if (!eventId) return undefined;
    try { return `/${nip19.neventEncode({ id: eventId, author: pubkey })}`; } catch { return undefined; }
  }, [eventId, pubkey]);

  return (
    <CommentContextRow prefix="Replying to" className={className} loading={author.isLoading}>
      <ProfileHoverCard pubkey={pubkey} asChild>
        <Link
          to={parentLink ?? `/${npubEncoded}`}
          className="text-primary hover:underline truncate"
          onClick={(e) => e.stopPropagation()}
        >
          @{displayName}
        </Link>
      </ProfileHoverCard>
    </CommentContextRow>
  );
}

/** Comment context for addressable event roots (A tag). */
function AddrCommentContext({ root, className }: { root: CommentRoot; className?: string }) {
  // Kind 0 (profile) roots get special treatment — show "@DisplayName" with a profile link
  if (root.addr?.kind === 0) {
    return <ProfileCommentContext pubkey={root.addr.pubkey} className={className} />;
  }

  // Kind 30008 (profile badges) roots — show "@User's profile badges"
  if (root.addr?.kind === 30008) {
    return <ProfileBadgesCommentContext root={root} className={className} />;
  }

  return <GenericAddrCommentContext root={root} className={className} />;
}

/** Comment context for kind 0 (profile) roots — shows "Commenting on @Name". */
function ProfileCommentContext({ pubkey, className }: { pubkey: string; className?: string }) {
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
  const displayName = metadata?.name ?? genUserName(pubkey);
  const npubEncoded = useMemo(() => nip19.npubEncode(pubkey), [pubkey]);

  return (
    <CommentContextRow prefix="Commenting on" className={className} loading={author.isLoading}>
      <ProfileHoverCard pubkey={pubkey} asChild>
        <Link
          to={`/${npubEncoded}`}
          className="text-primary hover:underline truncate"
          onClick={(e) => e.stopPropagation()}
        >
          @{displayName}
        </Link>
      </ProfileHoverCard>
    </CommentContextRow>
  );
}

/** Comment context for kind 30008 (profile badges) roots — shows "Commenting on profile badges by @User". */
function ProfileBadgesCommentContext({ root, className }: { root: CommentRoot; className?: string }) {
  const pubkey = root.addr?.pubkey ?? '';
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
  const displayName = metadata?.name ?? genUserName(pubkey);
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
    <CommentContextRow prefix="Commenting on" className={className} loading={author.isLoading}>
      {link && hoverContent ? (
        <EventHoverLink
          display={{ text: 'profile badges', icon: Award }}
          link={link}
          hoverContent={hoverContent}
        />
      ) : (
        <span className="inline-flex items-center gap-1 truncate">
          <Award className="size-3.5 shrink-0" />
          profile badges
        </span>
      )}
      <span className="shrink-0">by</span>
      <ProfileHoverCard pubkey={pubkey} asChild>
        <Link
          to={`/${npubEncoded}`}
          className="text-primary hover:underline truncate"
          onClick={(e) => e.stopPropagation()}
        >
          @{displayName}
        </Link>
      </ProfileHoverCard>
    </CommentContextRow>
  );
}

/** Comment context for non-profile addressable event roots (A tag). */
function GenericAddrCommentContext({ root, className }: { root: CommentRoot; className?: string }) {
  const { data: event, isLoading } = useAddrEvent(root.addr);

  const isCommunity = root.rootKind === '34550' || root.addr?.kind === 34550;
  const prefix = isCommunity ? 'Posted in' : 'Commenting on';

  const display = event ? getEventDisplayName(event) : { text: getRootKindLabel(root.rootKind) };
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
  const { data: event, isLoading } = useEvent(root.eventId);

  // Kind 7 reactions get special treatment
  if (event?.kind === 7) {
    return <ReactionCommentContext event={event} className={className} />;
  }

  const display = event ? getEventDisplayName(event) : { text: getRootKindLabel(root.rootKind) };
  const link = event ? getRootLink(event) : undefined;

  const hoverContent = root.eventId ? (
    <EmbeddedNote eventId={root.eventId} className="border-0 rounded-none" disableHoverCards />
  ) : undefined;

  return (
    <CommentContextRow prefix="Commenting on" className={className} loading={isLoading}>
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
    <CommentContextRow prefix="Commenting on" className={className}>
      <Link
        to={reactionLink}
        className="text-primary hover:underline shrink-0 cursor-pointer"
        onClick={(e) => e.stopPropagation()}
      >
        <ReactionEmoji content={event.content} tags={event.tags} className="inline-block align-text-bottom" />
      </Link>
      <span className="shrink-0">by</span>
      {author.isLoading ? (
        <Skeleton className="h-3.5 w-16 inline-block" />
      ) : (
        <ProfileHoverCard pubkey={event.pubkey} asChild>
          <Link
            to={profileLink}
            className="text-primary hover:underline truncate cursor-pointer"
            onClick={(e) => e.stopPropagation()}
          >
            @{displayName}
          </Link>
        </ProfileHoverCard>
      )}
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

  // URL identifiers get special treatment — show page title with favicon
  if (identifier.startsWith('http://') || identifier.startsWith('https://')) {
    return <UrlCommentContext url={identifier} className={className} />;
  }

  // ISO 3166 country/subdivision identifiers get special treatment
  if (identifier.startsWith('iso3166:')) {
    return <CountryCommentContext identifier={identifier} className={className} />;
  }

  // Generic fallback for other external identifiers
  const link = `/i/${encodeURIComponent(identifier)}`;

  return (
    <CommentContextRow prefix="Commenting on" className={className}>
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
    <CommentContextRow prefix="Commenting on" className={className} loading={isLoading}>
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
  const code = identifier.slice('iso3166:'.length);
  const info = getCountryInfo(code);
  const link = `/i/${encodeURIComponent(identifier)}`;

  const displayText = info
    ? info.subdivisionName
      ? `${info.flag} ${info.subdivisionName}`
      : `${info.flag} ${info.name}`
    : identifier;

  return (
    <CommentContextRow prefix="Commenting on" className={className}>
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
            <span className="text-2xl leading-none shrink-0" role="img" aria-label={info ? `Flag of ${info.name}` : code}>
              {info?.flag ?? '🌍'}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <MapPin className="size-3 shrink-0" />
                <span>{info?.subdivisionName ? 'Region' : 'Country'}</span>
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
  const isbn = identifier.slice('isbn:'.length);
  const { data: bookInfo, isLoading } = useBookInfo(isbn);
  const link = `/i/${encodeURIComponent(identifier)}`;
  const displayText = bookInfo?.title ?? identifier;
  const coverUrl = bookInfo?.cover?.medium || bookInfo?.cover?.large;
  const authors = bookInfo?.authors?.map((a) => a.name).join(', ');

  return (
    <CommentContextRow prefix="Commenting on" className={className} loading={isLoading}>
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
                alt={bookInfo?.title || 'Book cover'}
                className="w-9 h-12 rounded object-cover shrink-0"
                loading="lazy"
              />
            ) : (
              <div className="w-9 h-12 rounded bg-secondary flex items-center justify-center shrink-0">
                <BookOpen className="size-4 text-muted-foreground/40" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <BookOpen className="size-3 shrink-0" />
                <span>Book</span>
              </div>
              <p className="text-sm font-medium truncate mt-0.5">
                {bookInfo?.title || `ISBN ${isbn}`}
              </p>
              {authors && (
                <p className="text-xs text-muted-foreground truncate">
                  by {authors}
                </p>
              )}
            </div>
          </div>
        </HoverCardContent>
      </HoverCard>
    </CommentContextRow>
  );
}

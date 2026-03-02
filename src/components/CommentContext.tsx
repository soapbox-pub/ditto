import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';

import { EmbeddedNote } from '@/components/EmbeddedNote';
import { ReactionEmoji } from '@/components/CustomEmoji';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAddrEvent, useEvent } from '@/hooks/useEvent';
import { useAuthor } from '@/hooks/useAuthor';
import { useBookInfo } from '@/hooks/useBookInfo';
import { getDisplayName } from '@/lib/getDisplayName';
import { genUserName } from '@/lib/genUserName';
import { getCountryInfo } from '@/lib/countries';
import { EXTRA_KINDS } from '@/lib/extraKinds';

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

/** Get a display name for an event based on its kind and tags. */
function getEventDisplayName(event: NostrEvent): string {
  // Try title tag first (used by articles, themes, follow packs, etc.)
  const title = event.tags.find(([name]) => name === 'title')?.[1];
  if (title) return title;

  // Try name tag (used by communities, emoji packs, etc.)
  const name = event.tags.find(([name]) => name === 'name')?.[1];
  if (name) return name;

  // Try d tag (addressable events use this as an identifier)
  const dTag = event.tags.find(([name]) => name === 'd')?.[1];
  if (dTag) return dTag;

  // Fall back to kind label from EXTRA_KINDS
  const kindDef = EXTRA_KINDS.find((def) =>
    def.subKinds?.some((sub) => sub.kind === event.kind) || def.kind === event.kind,
  );
  if (kindDef) return kindDef.label.toLowerCase();

  // Last resort
  return 'a post';
}

/** Get a human-readable kind label for fallback display. */
function getKindLabel(rootKind: string | undefined): string {
  if (!rootKind) return 'a post';

  const kindNum = parseInt(rootKind, 10);
  if (isNaN(kindNum)) {
    // External content kinds (web, #, etc.)
    if (rootKind === 'web' || rootKind === 'https' || rootKind === 'http') return 'a link';
    if (rootKind === '#') return 'a hashtag';
    return rootKind;
  }

  if (kindNum === 7) return 'a reaction';

  const kindDef = EXTRA_KINDS.find((def) =>
    def.subKinds?.some((sub) => sub.kind === kindNum) || def.kind === kindNum,
  );
  if (kindDef) return kindDef.label.toLowerCase();

  return 'a post';
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

interface CommentContextProps {
  event: NostrEvent;
  className?: string;
}

/**
 * Displays "Commenting on [name]" context for kind 1111 comments.
 * Fetches the root event to display its title/name, with a hover preview.
 */
export function CommentContext({ event, className }: CommentContextProps) {
  const root = useMemo(() => parseCommentRoot(event), [event]);

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

/** Comment context for addressable event roots (A tag). */
function AddrCommentContext({ root, className }: { root: CommentRoot; className?: string }) {
  // Kind 0 (profile) roots get special treatment — show "@DisplayName" with a profile link
  if (root.addr?.kind === 0) {
    return <ProfileCommentContext pubkey={root.addr.pubkey} className={className} />;
  }

  return <GenericAddrCommentContext root={root} className={className} />;
}

/** Comment context for kind 0 (profile) roots — shows "Commenting on @Name". */
function ProfileCommentContext({ pubkey, className }: { pubkey: string; className?: string }) {
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
  const displayName = metadata?.name ?? genUserName(pubkey);
  const npubEncoded = useMemo(() => nip19.npubEncode(pubkey), [pubkey]);

  if (author.isLoading) {
    return (
      <div className={className || 'flex items-center gap-x-1 text-sm text-muted-foreground mt-2 mb-1'}>
        <span className="shrink-0">Commenting on</span>
        <Skeleton className="h-3.5 w-24 inline-block" />
      </div>
    );
  }

  return (
    <div className={className || 'flex items-center gap-x-1 text-sm text-muted-foreground mt-2 mb-1 min-w-0 overflow-hidden'}>
      <span className="shrink-0">Commenting on</span>
      <Link
        to={`/${npubEncoded}`}
        className="text-primary hover:underline truncate"
        onClick={(e) => e.stopPropagation()}
      >
        @{displayName}
      </Link>
    </div>
  );
}

/** Comment context for non-profile addressable event roots (A tag). */
function GenericAddrCommentContext({ root, className }: { root: CommentRoot; className?: string }) {
  const { data: event, isLoading } = useAddrEvent(root.addr);

  const isCommunity = root.rootKind === '34550' || root.addr?.kind === 34550;
  const prefix = isCommunity ? 'Posted in' : 'Commenting on';

  if (isLoading) {
    return (
      <div className={className || 'flex items-center gap-x-1 text-sm text-muted-foreground mt-2 mb-1'}>
        <span className="shrink-0">{prefix}</span>
        <Skeleton className="h-3.5 w-24 inline-block" />
      </div>
    );
  }

  const displayName = event ? getEventDisplayName(event) : getKindLabel(root.rootKind);
  const link = event ? getRootLink(event) : undefined;

  return (
    <div className={className || 'flex items-center gap-x-1 text-sm text-muted-foreground mt-2 mb-1 min-w-0 overflow-hidden'}>
      <span className="shrink-0">{prefix}</span>
      {link ? (
        <Link
          to={link}
          className="text-primary hover:underline truncate"
          onClick={(e) => e.stopPropagation()}
        >
          {displayName}
        </Link>
      ) : (
        <span className="truncate">{displayName}</span>
      )}
    </div>
  );
}

/** Comment context for regular event roots (E tag). */
function EventCommentContext({ root, className }: { root: CommentRoot; className?: string }) {
  const { data: event, isLoading } = useEvent(root.eventId);

  const label = useMemo(() => {
    if (!root.eventId) return undefined;

    if (event) {
      return (
        <HoverCard openDelay={300} closeDelay={150}>
          <HoverCardTrigger asChild>
            <Link
              to={getRootLink(event)}
              className="text-primary hover:underline truncate cursor-pointer"
              onClick={(e) => e.stopPropagation()}
            >
              {getEventDisplayName(event)}
            </Link>
          </HoverCardTrigger>
          <HoverCardContent
            side="bottom"
            align="start"
            sideOffset={4}
            className="w-80 p-0 rounded-2xl shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <EmbeddedNote eventId={root.eventId!} className="border-0 rounded-none" disableHoverCards />
          </HoverCardContent>
        </HoverCard>
      );
    }

    return undefined;
  }, [event, root.eventId]);

  // Kind 7 reactions get special treatment
  if (event?.kind === 7) {
    return <ReactionCommentContext event={event} className={className} />;
  }

  if (isLoading) {
    return (
      <div className={className || 'flex items-center gap-x-1 text-sm text-muted-foreground mt-2 mb-1'}>
        <span className="shrink-0">Commenting on</span>
        <Skeleton className="h-3.5 w-24 inline-block" />
      </div>
    );
  }

  // Fallback for kind 7 when event hasn't loaded yet but rootKind indicates it
  if (root.rootKind === '7') {
    return (
      <div className={className || 'flex items-center gap-x-1 text-sm text-muted-foreground mt-2 mb-1'}>
        <span className="shrink-0">Commenting on</span>
        <span className="truncate">a reaction</span>
      </div>
    );
  }

  return (
    <div className={className || 'flex items-center gap-x-1 text-sm text-muted-foreground mt-2 mb-1 min-w-0 overflow-hidden'}>
      <span className="shrink-0">Commenting on</span>
      {label ?? <span className="truncate">{getKindLabel(root.rootKind)}</span>}
    </div>
  );
}

/** Comment context for kind 7 reaction roots — shows "Commenting on {emoji} by {name}". */
function ReactionCommentContext({ event, className }: { event: NostrEvent; className?: string }) {
  const author = useAuthor(event.pubkey);
  const metadata = author.data?.metadata;
  const displayName = getDisplayName(metadata, event.pubkey);
  const reactionLink = getRootLink(event);
  const profileLink = `/${nip19.npubEncode(event.pubkey)}`;

  return (
    <div className={className || 'flex items-center gap-x-1 text-sm text-muted-foreground mt-2 mb-1 min-w-0 overflow-hidden'}>
      <span className="shrink-0">Commenting on</span>
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
        <Link
          to={profileLink}
          className="text-primary hover:underline truncate cursor-pointer"
          onClick={(e) => e.stopPropagation()}
        >
          {displayName}
        </Link>
      )}
    </div>
  );
}

/** Comment context for external content roots (I tag). */
function ExternalCommentContext({ root, className }: { root: CommentRoot; className?: string }) {
  const identifier = root.identifier ?? '';

  // ISBN identifiers get special treatment — show book title instead of raw ISBN
  if (identifier.startsWith('isbn:')) {
    return <IsbnCommentContext identifier={identifier} className={className} />;
  }

  // Determine display text and link
  let displayText: string;
  let link: string | undefined;

  if (identifier.startsWith('http://') || identifier.startsWith('https://')) {
    try {
      const url = new URL(identifier);
      displayText = url.hostname + (url.pathname !== '/' ? url.pathname : '');
      link = `/i/${encodeURIComponent(identifier)}`;
    } catch {
      displayText = identifier;
    }
  } else if (identifier.startsWith('iso3166:')) {
    const code = identifier.slice('iso3166:'.length);
    const info = getCountryInfo(code);
    if (info) {
      // For subdivisions (e.g. US-TX), show "🇺🇸 United States (TX)"
      const subdivisionSuffix = info.subdivision
        ? ` (${info.subdivision.split('-')[1] ?? info.subdivision})`
        : '';
      displayText = `${info.flag} ${info.name}${subdivisionSuffix}`;
    } else {
      displayText = identifier;
    }
    link = `/i/${encodeURIComponent(identifier)}`;
  } else if (identifier.startsWith('#')) {
    displayText = identifier;
    link = `/i/${encodeURIComponent(identifier)}`;
  } else {
    // podcast:guid:, etc.
    displayText = identifier;
    link = `/i/${encodeURIComponent(identifier)}`;
  }

  return (
    <div className={className || 'flex items-center gap-x-1 text-sm text-muted-foreground mt-2 mb-1 min-w-0 overflow-hidden'}>
      <span className="shrink-0">Commenting on</span>
      {link ? (
        <Link
          to={link}
          className="text-primary hover:underline truncate"
          onClick={(e) => e.stopPropagation()}
        >
          {displayText}
        </Link>
      ) : (
        <span className="truncate">{displayText}</span>
      )}
    </div>
  );
}

/** Comment context for ISBN identifiers — fetches and displays the book title. */
function IsbnCommentContext({ identifier, className }: { identifier: string; className?: string }) {
  const isbn = identifier.slice('isbn:'.length);
  const { data: bookInfo, isLoading } = useBookInfo(isbn);
  const link = `/i/${encodeURIComponent(identifier)}`;
  const displayText = bookInfo?.title ?? identifier;

  if (isLoading) {
    return (
      <div className={className || 'flex items-center gap-x-1 text-sm text-muted-foreground mt-2 mb-1'}>
        <span className="shrink-0">Commenting on</span>
        <Skeleton className="h-3.5 w-24 inline-block" />
      </div>
    );
  }

  return (
    <div className={className || 'flex items-center gap-x-1 text-sm text-muted-foreground mt-2 mb-1 min-w-0 overflow-hidden'}>
      <span className="shrink-0">Commenting on</span>
      <Link
        to={link}
        className="text-primary hover:underline truncate"
        onClick={(e) => e.stopPropagation()}
      >
        {displayText}
      </Link>
    </div>
  );
}

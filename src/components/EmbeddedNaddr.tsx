import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import { Award, MessageSquareOff } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { getAvatarShape } from '@/lib/avatarShape';
import { Skeleton } from '@/components/ui/skeleton';
import { EmojifiedText } from '@/components/CustomEmoji';
import { NoteCard } from '@/components/NoteCard';
import { parseBadgeDefinition } from '@/components/BadgeContent';
import { useAddrEvent, type AddrCoords } from '@/hooks/useEvent';
import { useAuthor } from '@/hooks/useAuthor';
import { genUserName } from '@/lib/genUserName';
import { timeAgo } from '@/lib/timeAgo';
import { cn } from '@/lib/utils';
import type { NostrEvent } from '@nostrify/nostrify';

/** Kinds that render as a full NoteCard instead of a generic embed. */
const NOTECARD_KINDS = new Set([30000, 39089]);

interface EmbeddedNaddrProps {
  /** The decoded naddr coordinates. */
  addr: AddrCoords;
  className?: string;
}

/** Maximum characters of content to show in the embedded preview. */
const MAX_CONTENT_LENGTH = 280;

/** Extract metadata from an addressable event's tags and content. */
function extractMetadata(event: NostrEvent): {
  title?: string;
  description?: string;
  image?: string;
} {
  const getTag = (name: string) => event.tags.find(([n]) => n === name)?.[1];

  let title = getTag('title') || getTag('name');
  let description = getTag('summary') || getTag('description');
  let image = getTag('image') || getTag('thumb') || getTag('banner');

  // Try parsing JSON content for additional metadata
  if (event.content) {
    try {
      const parsed = JSON.parse(event.content);
      if (typeof parsed === 'object' && parsed !== null) {
        if (!title && parsed.title) title = parsed.title;
        if (!description && parsed.description) description = parsed.description;
        if (!image && parsed.images?.[0]) image = parsed.images[0];
        if (!image && parsed.image) image = parsed.image;
      }
    } catch {
      // Content is not JSON — use it as description fallback
      if (!description && event.content.length > 0) {
        description = event.content;
      }
    }
  }

  return { title, description, image };
}

/** Inline embedded card for an addressable Nostr event (naddr). */
export function EmbeddedNaddr({ addr, className }: EmbeddedNaddrProps) {
  const { data: event, isLoading, isError } = useAddrEvent(addr);

  if (isLoading) {
    return <EmbeddedNaddrSkeleton className={className} />;
  }

  if (isError || !event) {
    return <EmbeddedNaddrTombstone addr={addr} className={className} />;
  }

  // For follow packs / starter packs, render the same NoteCard used in feeds (without actions)
  if (NOTECARD_KINDS.has(event.kind)) {
    return (
      <div className={className} onClick={(e) => e.stopPropagation()}>
        <NoteCard event={event} compact className="rounded-2xl border border-border !border-b overflow-hidden" />
      </div>
    );
  }

  // Badge definitions get a compact showcase instead of a link-preview card
  if (event.kind === 30009) {
    return <EmbeddedBadgeCard event={event} className={className} />;
  }

  return <EmbeddedNaddrCard event={event} className={className} />;
}

/** Compact badge showcase for kind 30009 embeds — smaller version of the feed BadgeContent. */
function EmbeddedBadgeCard({ event, className }: { event: NostrEvent; className?: string }) {
  const navigate = useNavigate();
  const badge = useMemo(() => parseBadgeDefinition(event), [event]);

  const naddrId = useMemo(() => {
    const dTag = event.tags.find(([n]) => n === 'd')?.[1] ?? '';
    return nip19.naddrEncode({ kind: event.kind, pubkey: event.pubkey, identifier: dTag });
  }, [event]);

  if (!badge) return <EmbeddedNaddrCard event={event} className={className} />;

  const heroImage = badge.image
    ?? badge.thumbs.find((t) => t.dimensions === '512x512')?.url
    ?? badge.thumbs[0]?.url;

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
        navigate(`/${naddrId}`);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          navigate(`/${naddrId}`);
        }
      }}
    >
      {/* Compact badge showcase */}
      <div className="relative isolate flex flex-col items-center py-6 overflow-hidden">
        {/* Rotating light rays — scaled down from the feed version */}
        <div
          className="absolute -z-10 pointer-events-none"
          aria-hidden="true"
          style={{
            width: 240,
            height: 240,
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -55%)',
          }}
        >
          <div
            className="w-full h-full animate-badge-spotlight"
            style={{
              background: `repeating-conic-gradient(
                hsl(var(--primary) / 0.08) 0deg 6deg,
                transparent 6deg 18deg
              )`,
              maskImage: 'radial-gradient(circle, black 15%, transparent 70%)',
              WebkitMaskImage: 'radial-gradient(circle, black 15%, transparent 70%)',
            }}
          />
        </div>

        {/* Badge image */}
        <div className="relative z-[1]">
          {heroImage ? (
            <img
              src={heroImage}
              alt={badge.name}
              className="size-20 rounded-xl object-cover drop-shadow-lg"
              loading="lazy"
              decoding="async"
            />
          ) : (
            <div className="size-20 rounded-xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent flex items-center justify-center">
              <Award className="size-8 text-primary/30" />
            </div>
          )}
        </div>

        {/* Badge info */}
        <div className="relative z-[1] mt-3 text-center px-4 max-w-xs">
          <p className="text-sm font-semibold leading-snug">{badge.name}</p>
          {badge.description && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{badge.description}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function EmbeddedNaddrCard({ event, className }: { event: NostrEvent; className?: string }) {
  const navigate = useNavigate();
  const author = useAuthor(event.pubkey);
  const metadata = author.data?.metadata;
  const avatarShape = getAvatarShape(metadata);
  const displayName = metadata?.name || genUserName(event.pubkey);
  const npub = useMemo(() => nip19.npubEncode(event.pubkey), [event.pubkey]);

  const naddrId = useMemo(() => {
    const dTag = event.tags.find(([n]) => n === 'd')?.[1] ?? '';
    return nip19.naddrEncode({ kind: event.kind, pubkey: event.pubkey, identifier: dTag });
  }, [event]);

  const { title, description, image } = useMemo(() => extractMetadata(event), [event]);

  const truncatedDesc = useMemo(() => {
    if (!description) return undefined;
    if (description.length <= MAX_CONTENT_LENGTH) return description;
    return description.slice(0, MAX_CONTENT_LENGTH).trimEnd() + '…';
  }, [description]);

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
        navigate(`/${naddrId}`);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          navigate(`/${naddrId}`);
        }
      }}
    >
      {/* Image */}
      {image && (
        <div className="w-full overflow-hidden">
          <img
            src={image}
            alt=""
            className="w-full h-[180px] object-cover"
            loading="lazy"
            onError={(e) => {
              (e.currentTarget.parentElement as HTMLElement).style.display = 'none';
            }}
          />
        </div>
      )}

      {/* Text content */}
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
              <Link
                to={`/${npub}`}
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

              <Link
                to={`/${npub}`}
                className="text-sm font-semibold truncate hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                {author.data?.event ? (
                  <EmojifiedText tags={author.data.event.tags}>{displayName}</EmojifiedText>
                ) : displayName}
              </Link>
            </>
          )}

          <span className="text-xs text-muted-foreground shrink-0">
            · {timeAgo(event.created_at)}
          </span>
        </div>

        {/* Title */}
        {title && (
          <p className="text-sm font-semibold leading-snug line-clamp-2">
            {title}
          </p>
        )}

        {/* Description */}
        {truncatedDesc && (
          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
            {truncatedDesc}
          </p>
        )}

      </div>
    </div>
  );
}

/** Tombstone shown when an addressable event could not be loaded. */
function EmbeddedNaddrTombstone({ addr, className }: { addr: AddrCoords; className?: string }) {
  const navigate = useNavigate();

  const naddrId = useMemo(
    () => nip19.naddrEncode({
      kind: addr.kind,
      pubkey: addr.pubkey,
      identifier: addr.identifier,
    }),
    [addr],
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
        navigate(`/${naddrId}`);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          navigate(`/${naddrId}`);
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

function EmbeddedNaddrSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-2xl border border-border overflow-hidden', className)}>
      <Skeleton className="w-full h-[180px] rounded-none" />
      <div className="px-3.5 py-2.5 space-y-2">
        <div className="flex items-center gap-2">
          <Skeleton className="size-5 rounded-full" />
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-3 w-10" />
        </div>
        <Skeleton className="h-4 w-3/4" />
        <div className="space-y-1.5">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
        </div>
      </div>
    </div>
  );
}

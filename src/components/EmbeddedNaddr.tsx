import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { getAvatarShape } from '@/lib/avatarShape';
import { Skeleton } from '@/components/ui/skeleton';
import { EmojifiedText } from '@/components/CustomEmoji';
import { NoteCard } from '@/components/NoteCard';
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
    return null;
  }

  // For follow packs / starter packs, render the same NoteCard used in feeds (without actions)
  if (NOTECARD_KINDS.has(event.kind)) {
    return (
      <div className={className} onClick={(e) => e.stopPropagation()}>
        <NoteCard event={event} compact className="rounded-2xl border border-border !border-b overflow-hidden" />
      </div>
    );
  }

  return <EmbeddedNaddrCard event={event} className={className} />;
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

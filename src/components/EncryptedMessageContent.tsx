import type { NostrEvent } from '@nostrify/nostrify';
import { useMemo } from 'react';
import { Mail } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { nip19 } from 'nostr-tools';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ProfileHoverCard } from '@/components/ProfileHoverCard';
import { useAuthor } from '@/hooks/useAuthor';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { getAvatarShape } from '@/lib/avatarShape';
import { getDisplayName } from '@/lib/getDisplayName';
import { genUserName } from '@/lib/genUserName';
import { Skeleton } from '@/components/ui/skeleton';
import { timeAgo } from '@/lib/timeAgo';
import { cn } from '@/lib/utils';

interface EncryptedMessageContentProps {
  event: NostrEvent;
  /** Whether to use the compact card layout (feed) vs expanded (detail page). */
  compact?: boolean;
  className?: string;
}

/** Renders a single participant avatar with name and link. */
function Participant({ pubkey }: { pubkey: string }) {
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
  const avatarShape = getAvatarShape(metadata);
  const displayName = getDisplayName(metadata, pubkey);
  const profileUrl = useProfileUrl(pubkey, metadata);

  if (author.isLoading) {
    return (
      <div className="flex flex-col items-center gap-1.5 min-w-0">
        <Skeleton className="size-10 rounded-full" />
        <Skeleton className="h-3 w-14" />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-1.5 min-w-0">
      <ProfileHoverCard pubkey={pubkey} asChild>
        <Link to={profileUrl} onClick={(e) => e.stopPropagation()}>
          <Avatar shape={avatarShape} className="size-10 ring-2 ring-background shadow-md">
            <AvatarImage src={metadata?.picture} alt={displayName} />
            <AvatarFallback className="bg-primary/20 text-primary text-xs font-semibold">
              {displayName[0]?.toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </Link>
      </ProfileHoverCard>
      <ProfileHoverCard pubkey={pubkey} asChild>
        <Link
          to={profileUrl}
          onClick={(e) => e.stopPropagation()}
          className="text-xs font-medium text-foreground/80 hover:text-foreground truncate max-w-[80px] transition-colors"
        >
          {displayName}
        </Link>
      </ProfileHoverCard>
    </div>
  );
}

/**
 * Visual display for kind 4 (NIP-04 encrypted DM) events.
 *
 * Instead of rendering the encrypted ciphertext, it shows a
 * "mail in transit" visualization: sender avatar -> dashed path with mail icon -> recipient avatar.
 */
export function EncryptedMessageContent({ event, compact: _compact, className }: EncryptedMessageContentProps) {
  const recipientPubkey = event.tags.find(([n]) => n === 'p')?.[1];
  const senderAuthor = useAuthor(event.pubkey);
  const senderName = getDisplayName(senderAuthor.data?.metadata, event.pubkey);

  if (!recipientPubkey) {
    return (
      <div className={cn('mt-2 px-4 py-3', className)}>
        <p className="text-sm text-muted-foreground italic">Encrypted message (no recipient found)</p>
      </div>
    );
  }

  return (
    <div className={cn('mt-2', className)}>
      <div className="rounded-2xl border border-border px-5 py-4">
        {/* Description */}
        <p className="text-sm text-muted-foreground text-center mb-3">
          <span className="font-medium text-foreground">{senderName}</span> sent a direct message
        </p>

        <div className="flex items-center justify-center gap-3">
          {/* Sender */}
          <Participant pubkey={event.pubkey} />

          {/* Transit path */}
          <div className="flex-1 flex items-center justify-center min-w-0 max-w-[180px] relative">
            {/* Dotted line */}
            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-px border-t-2 border-dashed border-foreground/15" />

            {/* Mail icon in the center */}
            <div className="relative z-10 flex items-center justify-center">
              <div className="size-9 rounded-full bg-background border-2 border-foreground/10 flex items-center justify-center shadow-sm">
                <Mail className="size-4 text-muted-foreground" />
              </div>
            </div>
          </div>

          {/* Recipient */}
          <Participant pubkey={recipientPubkey} />
        </div>
      </div>
    </div>
  );
}

interface EncryptedMessageCompactProps {
  event: { id: string; kind: number; pubkey: string; content: string; created_at: number; tags: string[][] };
  className?: string;
}

/**
 * Compact inline card for kind 4 events used in quote posts, reply indicators,
 * and the reply composer. Matches the style of EmbeddedNoteCard.
 */
export function EncryptedMessageCompact({ event, className }: EncryptedMessageCompactProps) {
  const navigate = useNavigate();
  const author = useAuthor(event.pubkey);
  const metadata = author.data?.metadata;
  const avatarShape = getAvatarShape(metadata);
  const displayName = metadata?.name || metadata?.display_name || genUserName(event.pubkey);
  const recipientPubkey = event.tags.find(([n]) => n === 'p')?.[1];
  const recipientAuthor = useAuthor(recipientPubkey ?? '');
  const recipientName = recipientPubkey
    ? getDisplayName(recipientAuthor.data?.metadata, recipientPubkey)
    : undefined;

  const neventId = useMemo(
    () => nip19.neventEncode({ id: event.id, author: event.pubkey }),
    [event.id, event.pubkey],
  );

  const profileUrl = useProfileUrl(event.pubkey, metadata);

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
              <ProfileHoverCard pubkey={event.pubkey} asChild>
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
              </ProfileHoverCard>

              <ProfileHoverCard pubkey={event.pubkey} asChild>
                <Link
                  to={profileUrl}
                  className="text-sm font-semibold truncate hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  {displayName}
                </Link>
              </ProfileHoverCard>
            </>
          )}

          <span className="text-xs text-muted-foreground shrink-0">
            · {timeAgo(event.created_at)}
          </span>
        </div>

        {/* Content line */}
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Mail className="size-3.5 shrink-0" />
          <span>
            Sent a direct message{recipientName ? <> to <span className="font-medium text-foreground">{recipientName}</span></> : ''}
          </span>
        </p>
      </div>
    </div>
  );
}

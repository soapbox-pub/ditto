import type { NostrEvent } from '@nostrify/nostrify';
import { Lock, Mail } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ProfileHoverCard } from '@/components/ProfileHoverCard';
import { useAuthor } from '@/hooks/useAuthor';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { getAvatarShape } from '@/lib/avatarShape';
import { getDisplayName } from '@/lib/getDisplayName';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface EncryptedMessageContentProps {
  event: NostrEvent;
  /** Whether to use the compact card layout (feed) vs expanded (detail page). */
  compact?: boolean;
  className?: string;
}

/**
 * Detect whether the content uses NIP-04 (AES-256-CBC with ?iv=) or NIP-44 encryption.
 * NIP-04 content contains a base64 body followed by `?iv=<base64>`.
 * NIP-44 uses a versioned binary blob encoded as base64 without the ?iv= suffix.
 */
function detectEncryptionType(content: string): 'NIP-04' | 'NIP-44' | 'Unknown' {
  if (!content) return 'Unknown';
  if (/\?iv=/.test(content)) return 'NIP-04';
  // NIP-44 payloads are pure base64 without the ?iv= marker
  if (/^[A-Za-z0-9+/]+=*$/.test(content.trim()) && content.length > 20) return 'NIP-44';
  return 'Unknown';
}

/** Renders a single participant avatar with name and link. */
function Participant({ pubkey, side }: { pubkey: string; side: 'sender' | 'recipient' }) {
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
    <div className={cn('flex flex-col items-center gap-1.5 min-w-0', side === 'sender' ? 'items-center' : 'items-center')}>
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
 * Compact card for kind 4 (NIP-04 encrypted DM) events.
 *
 * Instead of rendering the encrypted ciphertext, it shows a visual
 * "mail in transit" display: sender avatar -> animated path with lock -> recipient avatar.
 * Detects and labels the encryption type (NIP-04 vs NIP-44).
 */
export function EncryptedMessageContent({ event, compact: _compact, className }: EncryptedMessageContentProps) {
  const recipientPubkey = event.tags.find(([n]) => n === 'p')?.[1];
  const encryptionType = detectEncryptionType(event.content);

  if (!recipientPubkey) {
    return (
      <div className={cn('mt-2 rounded-xl border border-border/60 bg-muted/30 px-4 py-3', className)}>
        <p className="text-sm text-muted-foreground italic">Encrypted message (no recipient found)</p>
      </div>
    );
  }

  return (
    <div className={cn('mt-2', className)}>
      <div className="rounded-xl border border-border/60 bg-gradient-to-br from-muted/40 via-background to-muted/40 overflow-hidden">
        {/* Main transit visualization */}
        <div className="px-5 py-4">
          <div className="flex items-center justify-center gap-3">
            {/* Sender */}
            <Participant pubkey={event.pubkey} side="sender" />

            {/* Animated transit path */}
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
            <Participant pubkey={recipientPubkey} side="recipient" />
          </div>
        </div>

        {/* Footer with encryption badge */}
        <div className="px-4 py-2 border-t border-border/40 bg-muted/20 flex items-center justify-center gap-2">
          <Lock className="size-3.5 text-muted-foreground/70" />
          <span className="text-[11px] text-muted-foreground/70 font-medium tracking-wide uppercase">
            Encrypted with {encryptionType}
          </span>
        </div>
      </div>
    </div>
  );
}

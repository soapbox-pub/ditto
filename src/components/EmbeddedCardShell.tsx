import { type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { getAvatarShape } from '@/lib/avatarShape';
import { Skeleton } from '@/components/ui/skeleton';
import { EmojifiedText } from '@/components/CustomEmoji';
import { ProfileHoverCard } from '@/components/ProfileHoverCard';
import { useAuthor } from '@/hooks/useAuthor';
import { genUserName } from '@/lib/genUserName';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { timeAgo } from '@/lib/timeAgo';
import { cn } from '@/lib/utils';

interface EmbeddedCardShellProps {
  /** Author pubkey — used for the author row. */
  pubkey: string;
  /** Timestamp of the event (unix seconds). */
  createdAt: number;
  /** The NIP-19 identifier to navigate to on click. */
  navigateTo: string;
  className?: string;
  /** When true, ProfileHoverCards inside the card are disabled. */
  disableHoverCards?: boolean;
  children: ReactNode;
}

/**
 * Shared clickable card shell with an author row used by all embedded
 * note / naddr preview cards.  Handles the outer border, hover style,
 * click / keyboard navigation, avatar, display name, and timestamp.
 *
 * Pass card-specific content (text preview, blobbi visual, badge row, etc.)
 * as `children`.
 */
export function EmbeddedCardShell({
  pubkey,
  createdAt,
  navigateTo,
  className,
  disableHoverCards,
  children,
}: EmbeddedCardShellProps) {
  const navigate = useNavigate();
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
  const avatarShape = getAvatarShape(metadata);
  const displayName = metadata?.name || genUserName(pubkey);
  const profileUrl = useProfileUrl(pubkey, metadata);

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
        navigate(`/${navigateTo}`);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          navigate(`/${navigateTo}`);
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
              <MaybeProfileHoverCard pubkey={pubkey} disabled={disableHoverCards}>
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
              </MaybeProfileHoverCard>

              <MaybeProfileHoverCard pubkey={pubkey} disabled={disableHoverCards}>
                <Link
                  to={profileUrl}
                  className="text-sm font-semibold truncate hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  {author.data?.event ? (
                    <EmojifiedText tags={author.data.event.tags}>{displayName}</EmojifiedText>
                  ) : displayName}
                </Link>
              </MaybeProfileHoverCard>
            </>
          )}

          <span className="text-xs text-muted-foreground shrink-0">
            · {timeAgo(createdAt)}
          </span>
        </div>

        {children}
      </div>
    </div>
  );
}

/** Conditionally wraps children in a ProfileHoverCard. */
function MaybeProfileHoverCard({ pubkey, disabled, children }: { pubkey: string; disabled?: boolean; children: ReactNode }) {
  if (disabled) {
    return <>{children}</>;
  }
  return (
    <ProfileHoverCard pubkey={pubkey} asChild>
      {children}
    </ProfileHoverCard>
  );
}

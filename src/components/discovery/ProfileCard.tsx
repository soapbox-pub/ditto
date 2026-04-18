import { Link } from 'react-router-dom';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { getAvatarShape } from '@/lib/avatarShape';
import { useAuthor } from '@/hooks/useAuthor';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { getDisplayName } from '@/lib/getDisplayName';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { cn } from '@/lib/utils';

interface ProfileCardProps {
  /** Nostr pubkey of the profile. */
  pubkey: string;
  /** Subtitle line below the name (e.g. "5 tracks"). */
  subtitle?: string;
  /** Extra classes on the outer container. */
  className?: string;
}

/**
 * Circular avatar profile card for discovery page grids and horizontal scrolls.
 * Displays avatar, display name, and an optional subtitle (e.g. track count).
 *
 * Clicking navigates to the user's profile page.
 *
 * Used by music artist cards, podcast host cards, and other
 * profile-centric discovery sections.
 */
export function ProfileCard({ pubkey, subtitle, className }: ProfileCardProps) {
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
  const avatarShape = getAvatarShape(metadata);
  const displayName = getDisplayName(metadata, pubkey);
  const profileUrl = useProfileUrl(pubkey, metadata);

  return (
    <Link
      to={profileUrl}
      className={cn('w-[110px] shrink-0 flex flex-col items-center cursor-pointer group', className)}
    >
      <Avatar shape={avatarShape} className="size-20 border-2 border-border group-hover:border-primary/40 transition-colors">
        <AvatarImage src={sanitizeUrl(metadata?.picture)} alt={displayName} />
        <AvatarFallback className="bg-primary/20 text-primary text-lg font-semibold">
          {displayName[0]?.toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <p className="text-sm font-medium truncate mt-2 text-center w-full group-hover:text-primary transition-colors">
        {displayName}
      </p>
      {subtitle && (
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      )}
    </Link>
  );
}

/** Loading skeleton matching ProfileCard dimensions. */
export function ProfileCardSkeleton() {
  return (
    <div className="w-[110px] shrink-0 flex flex-col items-center">
      <Skeleton className="size-20 rounded-full" />
      <Skeleton className="h-4 w-16 mt-2" />
      <Skeleton className="h-3 w-12 mt-1" />
    </div>
  );
}

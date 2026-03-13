import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { useAuthor } from '@/hooks/useAuthor';
import { getDisplayName } from '@/lib/getDisplayName';
import { type AvatarShape, isValidAvatarShape } from '@/lib/avatarShape';
import { cn } from '@/lib/utils';

export interface UserAvatarProps {
  /** The Nostr public key (hex). */
  pubkey: string;
  /** Tailwind size class (e.g. "size-10", "size-6"). Applied to the Avatar root. */
  size?: string;
  /** Additional classes for the Avatar root (borders, rings, shadows, etc.). */
  className?: string;
  /** Additional classes for the AvatarFallback. */
  fallbackClassName?: string;
  /**
   * Override the avatar shape instead of reading it from the user's kind-0 metadata.
   * Useful for preview/edit contexts where the shape hasn't been saved yet.
   */
  shapeOverride?: AvatarShape;
}

/**
 * Self-contained avatar component that fetches the user's profile (kind 0)
 * and applies their chosen avatar shape as a clip-path mask.
 *
 * Replaces the pattern of manually wiring `useAuthor` → `Avatar` + `AvatarImage` + `AvatarFallback`
 * at every render site.
 */
export function UserAvatar({
  pubkey,
  size = 'size-10',
  className,
  fallbackClassName,
  shapeOverride,
}: UserAvatarProps) {
  const { data } = useAuthor(pubkey);
  const metadata = data?.metadata;

  const displayName = getDisplayName(metadata, pubkey);
  const initial = displayName[0]?.toUpperCase() ?? '?';

  // Determine shape: explicit override > metadata > default (circle)
  const metadataShape = isValidAvatarShape(metadata?.shape) ? metadata.shape : undefined;
  const shape = shapeOverride ?? metadataShape;

  return (
    <Avatar shape={shape} className={cn(size, className)}>
      <AvatarImage src={metadata?.picture} alt={displayName} />
      <AvatarFallback className={cn('bg-primary/20 text-primary', fallbackClassName)}>
        {initial}
      </AvatarFallback>
    </Avatar>
  );
}

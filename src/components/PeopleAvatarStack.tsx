import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { nip19 } from 'nostr-tools';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { getAvatarShape } from '@/lib/avatarShape';
import { useAuthors } from '@/hooks/useAuthors';
import { cn } from '@/lib/utils';

type AvatarSize = 'sm' | 'md' | 'lg';

/** Tailwind size classes per avatar size. */
const sizeClasses: Record<AvatarSize, string> = {
  sm: 'size-6',
  md: 'size-7',
  lg: 'size-9',
};

/** Tailwind negative-space class for overlap amount. */
const overlapClasses: Record<AvatarSize, string> = {
  sm: '-space-x-1.5',
  md: '-space-x-2',
  lg: '-space-x-3',
};

/** Fallback text size per avatar size. */
const fallbackTextClasses: Record<AvatarSize, string> = {
  sm: 'text-[10px]',
  md: 'text-[10px]',
  lg: 'text-xs',
};

interface PeopleAvatarStackProps {
  /** Pubkeys to render, in display order. Only the first `maxVisible` are rendered. */
  pubkeys: string[];
  /** How many avatars to show before collapsing into "+N more". Default 6. */
  maxVisible?: number;
  /** Avatar size preset. Default 'md'. */
  size?: AvatarSize;
  /** Class applied to the outer container. */
  className?: string;
}

/**
 * Horizontal stack of overlapping avatars with a "+N more" suffix.
 *
 * Used to render a compact preview of a list of people — follow lists,
 * follow sets, follow packs, and profile-recovery snapshots of kind 3.
 * Batch-fetches metadata for only the visible pubkeys via `useAuthors`.
 */
export function PeopleAvatarStack({
  pubkeys,
  maxVisible = 6,
  size = 'md',
  className,
}: PeopleAvatarStackProps) {
  const previewPubkeys = useMemo(() => pubkeys.slice(0, maxVisible), [pubkeys, maxVisible]);
  const { data: membersMap } = useAuthors(previewPubkeys);

  if (pubkeys.length === 0) return null;

  const overflow = pubkeys.length - previewPubkeys.length;

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className={cn('flex', overlapClasses[size])}>
        {previewPubkeys.map((pk) => {
          const member = membersMap?.get(pk);
          const displayName =
            member?.metadata?.name || member?.metadata?.display_name || 'Anonymous';
          const shape = getAvatarShape(member?.metadata);
          return (
            <Tooltip key={pk}>
              <TooltipTrigger asChild>
                <Link
                  to={`/${nip19.npubEncode(pk)}`}
                  aria-label={displayName}
                  onClick={(e) => e.stopPropagation()}
                  className={cn(
                    'rounded-full relative transition-transform duration-150 ease-out',
                    'hover:z-10 motion-safe:hover:scale-110 focus-visible:z-10 motion-safe:focus-visible:scale-110',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                  )}
                >
                  <Avatar
                    shape={shape}
                    className={cn(sizeClasses[size], 'ring-2 ring-background')}
                  >
                    <AvatarImage src={member?.metadata?.picture} alt={displayName} />
                    <AvatarFallback className={cn('bg-primary/20 text-primary', fallbackTextClasses[size])}>
                      {displayName[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </Link>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                {displayName}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
      {overflow > 0 && (
        <span className="text-xs text-muted-foreground">
          +{overflow} more
        </span>
      )}
    </div>
  );
}

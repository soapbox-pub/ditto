import type { NostrMetadata } from '@nostrify/nostrify';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getAvatarShape } from '@/lib/avatarShape';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuthor } from '@/hooks/useAuthor';
import { genUserName } from '@/lib/genUserName';
import { cn } from '@/lib/utils';

type AvatarSize = 'sm' | 'md';

const sizeClasses: Record<AvatarSize, string> = {
  sm: 'size-6 text-[10px]',
  md: 'size-8 text-xs',
};

const spacingClasses: Record<AvatarSize, string> = {
  sm: '-space-x-1.5',
  md: '-space-x-2',
};

/** Resolves a single pubkey's profile and renders the avatar with a tooltip. */
function RSVPAvatar({ pubkey, size = 'sm' }: { pubkey: string; size?: AvatarSize }) {
  const { data } = useAuthor(pubkey);
  const metadata: NostrMetadata | undefined = data?.metadata;
  const avatarShape = getAvatarShape(metadata as Record<string, unknown>);

  const displayName = metadata?.display_name || metadata?.name || genUserName(pubkey);
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Avatar shape={avatarShape} className={cn(sizeClasses[size], 'ring-2 ring-background')}>
          <AvatarImage src={metadata?.picture} />
          <AvatarFallback className="bg-muted text-muted-foreground">
            {initial}
          </AvatarFallback>
        </Avatar>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        {displayName}
      </TooltipContent>
    </Tooltip>
  );
}

interface RSVPAvatarsProps {
  pubkeys: string[];
  maxVisible?: number;
  size?: AvatarSize;
  className?: string;
}

export function RSVPAvatars({ pubkeys, maxVisible = 5, size = 'sm', className }: RSVPAvatarsProps) {
  const visible = pubkeys.slice(0, maxVisible);
  const overflow = pubkeys.length - maxVisible;

  return (
    <div className={cn('flex items-center', spacingClasses[size], className)}>
      {visible.map((pubkey) => (
        <RSVPAvatar key={pubkey} pubkey={pubkey} size={size} />
      ))}
      {overflow > 0 && (
        <span className="pl-2.5 text-xs text-muted-foreground">+{overflow}</span>
      )}
    </div>
  );
}

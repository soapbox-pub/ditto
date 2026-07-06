import { Link } from 'react-router-dom';
import { UsersRound } from 'lucide-react';
import { nip19 } from 'nostr-tools';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { cn } from '@/lib/utils';
import { COMMUNITY_KIND, communityModerators, type Community } from '@/lib/community';

interface CommunityCardProps {
  community: Community;
  /** Whether the viewer has joined this community. */
  joined?: boolean;
  /** Toggle join/leave. Omit to hide the button. */
  onToggleJoin?: (coord: string) => void;
  /** Whether a join/leave publish is in flight. */
  isToggling?: boolean;
  className?: string;
}

/**
 * Community directory row: avatar, name, description, and a Join button —
 * a full-bleed feed row matching Ditto's list styling.
 */
export function CommunityCard({ community, joined, onToggleJoin, isToggling, className }: CommunityCardProps) {
  const { user } = useCurrentUser();
  const image = sanitizeUrl(community.image);
  const modCount = communityModerators(community).length;

  const naddr = nip19.naddrEncode({
    kind: COMMUNITY_KIND,
    pubkey: community.event.pubkey, // validated by Nostrify event validation
    identifier: community.identifier,
  });

  return (
    <div
      className={cn(
        'flex items-center gap-3 px-4 py-3 border-b border-border hover:bg-secondary/30 transition-colors',
        className,
      )}
    >
      <Link to={`/${naddr}`} className="shrink-0">
        <Avatar className="size-11">
          <AvatarImage src={image} />
          <AvatarFallback className="bg-primary/20 text-primary">
            <UsersRound className="size-5" />
          </AvatarFallback>
        </Avatar>
      </Link>
      <Link to={`/${naddr}`} className="flex-1 min-w-0">
        <p className="font-bold text-[15px] truncate hover:underline">{community.name}</p>
        <p className="text-sm text-muted-foreground line-clamp-1 break-all">
          {community.description || `${modCount} moderator${modCount !== 1 ? 's' : ''}`}
        </p>
      </Link>
      {user && onToggleJoin && (
        <Button
          size="sm"
          variant={joined ? 'outline' : 'default'}
          className="rounded-full font-bold shrink-0"
          disabled={isToggling}
          onClick={() => onToggleJoin(community.coord)}
        >
          {joined ? 'Joined' : 'Join'}
        </Button>
      )}
    </div>
  );
}

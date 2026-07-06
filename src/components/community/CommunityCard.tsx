import { Link } from 'react-router-dom';
import { Users } from 'lucide-react';
import { nip19 } from 'nostr-tools';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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

/** Compact community card for discovery lists, linking to the community page. */
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
    <Card className={cn('overflow-hidden transition-colors hover:border-primary/30', className)}>
      <Link to={`/${naddr}`} className="block">
        {image ? (
          <div className="h-20 overflow-hidden">
            <img src={image} alt="" className="w-full h-full object-cover" loading="lazy" />
          </div>
        ) : (
          <div className="h-20 bg-gradient-to-br from-primary/15 via-primary/5 to-transparent flex items-center justify-center">
            <Users className="size-8 text-primary/25" />
          </div>
        )}
      </Link>
      <CardContent className="p-4 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <Link to={`/${naddr}`} className="min-w-0">
            <h3 className="font-semibold truncate hover:underline">{community.name}</h3>
            <p className="text-xs text-muted-foreground">
              {modCount} moderator{modCount !== 1 ? 's' : ''}
            </p>
          </Link>
          {user && onToggleJoin && (
            <Button
              size="sm"
              variant={joined ? 'secondary' : 'default'}
              className="h-7 shrink-0 text-xs"
              disabled={isToggling}
              onClick={() => onToggleJoin(community.coord)}
            >
              {joined ? 'Joined' : 'Join'}
            </Button>
          )}
        </div>
        {community.description && (
          <p className="text-sm text-muted-foreground line-clamp-2 break-words">
            {community.description}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

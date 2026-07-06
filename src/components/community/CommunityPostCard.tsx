import { useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MessageSquare, ShieldCheck } from 'lucide-react';
import type { NostrMetadata } from '@nostrify/nostrify';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { NoteContent } from '@/components/NoteContent';
import { VoteButtons } from '@/components/community/VoteButtons';
import { useAuthor } from '@/hooks/useAuthor';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { getAvatarShape } from '@/lib/avatarShape';
import { getDisplayName } from '@/lib/getDisplayName';
import { encodeEventNevent } from '@/lib/encodeEvent';
import { timeAgo } from '@/lib/timeAgo';
import { formatNumber } from '@/lib/formatNumber';
import { cn } from '@/lib/utils';
import type { CommunityPost } from '@/hooks/useCommunityPosts';

interface CommunityPostCardProps {
  post: CommunityPost;
  /** Whether the viewer moderates this community (shows the Approve action on pending posts). */
  isModerator?: boolean;
  /** Approve callback for moderators. */
  onApprove?: (post: CommunityPost) => void;
  /** Whether an approval publish is in flight. */
  isApproving?: boolean;
  className?: string;
}

/**
 * Reddit-style community post row: vote rail on the left, author line,
 * post body, and a comment-count footer. Clicking anywhere non-interactive
 * opens the post's detail page (threaded comments).
 */
export function CommunityPostCard({ post, isModerator, onApprove, isApproving, className }: CommunityPostCardProps) {
  const navigate = useNavigate();
  const { event } = post;
  const author = useAuthor(event.pubkey);
  const metadata: NostrMetadata | undefined = author.data?.metadata;
  const displayName = getDisplayName(metadata, event.pubkey);
  const avatarShape = getAvatarShape(metadata);
  const profileUrl = useProfileUrl(event.pubkey, metadata);

  const detailUrl = `/${encodeEventNevent(event)}`;

  const handleCardClick = useCallback((e: React.MouseEvent) => {
    // Don't hijack clicks on links, buttons, or media inside the card.
    const target = e.target as HTMLElement;
    if (target.closest('a, button, video, audio, [role="button"]')) return;
    navigate(detailUrl);
  }, [navigate, detailUrl]);

  return (
    <Card
      onClick={handleCardClick}
      className={cn(
        'flex overflow-hidden cursor-pointer transition-colors hover:border-primary/30',
        className,
      )}
    >
      {/* Vote rail */}
      <div className="flex flex-col items-center bg-muted/40 px-1.5 py-3 shrink-0">
        <VoteButtons event={event} />
      </div>

      {/* Body */}
      <div className="flex-1 min-w-0 p-3 space-y-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Link
            to={profileUrl}
            className="flex items-center gap-1.5 hover:underline min-w-0"
            onClick={(e) => e.stopPropagation()}
          >
            <Avatar shape={avatarShape} className="size-5">
              <AvatarImage src={metadata?.picture} />
              <AvatarFallback className="bg-muted text-muted-foreground text-[10px]">
                {displayName.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="font-medium text-foreground truncate">{displayName}</span>
          </Link>
          <span aria-hidden="true">·</span>
          <time dateTime={new Date(event.created_at * 1000).toISOString()} className="shrink-0">
            {timeAgo(event.created_at)}
          </time>
          {!post.approved && (
            <Badge variant="outline" className="ml-auto shrink-0 text-[10px] gap-1 text-amber-600 dark:text-amber-500 border-amber-500/40">
              Pending approval
            </Badge>
          )}
        </div>

        <div className="whitespace-pre-wrap break-words">
          <NoteContent event={event} className="text-sm" />
        </div>

        <div className="flex items-center gap-2 pt-1">
          <Link
            to={detailUrl}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
          >
            <MessageSquare className="size-3.5" />
            {formatNumber(post.commentCount)} comment{post.commentCount !== 1 ? 's' : ''}
          </Link>

          {isModerator && !post.approved && onApprove && (
            <Button
              size="sm"
              variant="outline"
              className="ml-auto h-7 gap-1.5 text-xs"
              disabled={isApproving}
              onClick={(e) => {
                e.stopPropagation();
                onApprove(post);
              }}
            >
              <ShieldCheck className="size-3.5" />
              Approve
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

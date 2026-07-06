import { useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MessageCircle, ShieldCheck, UsersRound } from 'lucide-react';
import { nip19 } from 'nostr-tools';
import type { NostrMetadata } from '@nostrify/nostrify';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { NoteContent } from '@/components/NoteContent';
import { VoteButtons } from '@/components/community/VoteButtons';
import { useAuthor } from '@/hooks/useAuthor';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { getAvatarShape } from '@/lib/avatarShape';
import { getDisplayName } from '@/lib/getDisplayName';
import { encodeEventNevent } from '@/lib/encodeEvent';
import { timeAgo } from '@/lib/timeAgo';
import { formatNumber } from '@/lib/formatNumber';
import { cn } from '@/lib/utils';
import { COMMUNITY_KIND, isCommunityModerator } from '@/lib/community';
import type { CommunityPost } from '@/hooks/useCommunityPosts';

interface CommunityPostCardProps {
  post: CommunityPost;
  /** Show a `c/name` line linking to the community (for aggregated feeds). */
  showCommunity?: boolean;
  /** Approve callback for moderators (shown on pending posts). */
  onApprove?: (post: CommunityPost) => void;
  /** Whether an approval publish is in flight. */
  isApproving?: boolean;
  className?: string;
}

/**
 * A community post as a full-bleed feed row (matching NoteCard's anatomy),
 * with Reddit-style up/down voting and a comment count in the action bar.
 * Clicking anywhere non-interactive opens the post's threaded detail page.
 */
export function CommunityPostCard({ post, showCommunity, onApprove, isApproving, className }: CommunityPostCardProps) {
  const navigate = useNavigate();
  const { user } = useCurrentUser();
  const { event, community } = post;
  const author = useAuthor(event.pubkey);
  const metadata: NostrMetadata | undefined = author.data?.metadata;
  const displayName = getDisplayName(metadata, event.pubkey);
  const avatarShape = getAvatarShape(metadata);
  const profileUrl = useProfileUrl(event.pubkey, metadata);

  const isModerator = isCommunityModerator(community, user?.pubkey);
  const detailUrl = `/${encodeEventNevent(event)}`;
  const communityUrl = `/${nip19.naddrEncode({
    kind: COMMUNITY_KIND,
    pubkey: community.event.pubkey,
    identifier: community.identifier,
  })}`;

  const handleCardClick = useCallback((e: React.MouseEvent) => {
    // Don't hijack clicks on links, buttons, or media inside the row.
    const target = e.target as HTMLElement;
    if (target.closest('a, button, video, audio, [role="button"]')) return;
    navigate(detailUrl);
  }, [navigate, detailUrl]);

  return (
    <article
      onClick={handleCardClick}
      className={cn(
        'relative px-4 py-3 border-b border-border hover:bg-secondary/30 transition-colors cursor-pointer overflow-hidden',
        className,
      )}
    >
      {/* Author row */}
      <div className="flex items-center gap-3">
        <Link to={profileUrl} onClick={(e) => e.stopPropagation()} className="shrink-0">
          <Avatar shape={avatarShape} className="size-11">
            <AvatarImage src={metadata?.picture} />
            <AvatarFallback className="bg-primary/20 text-primary text-sm">
              {displayName.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 min-w-0">
            {showCommunity ? (
              <Link
                to={communityUrl}
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-1 font-bold text-[15px] hover:underline truncate"
              >
                <UsersRound className="size-4 shrink-0" />
                {community.name}
              </Link>
            ) : (
              <Link
                to={profileUrl}
                onClick={(e) => e.stopPropagation()}
                className="font-bold text-[15px] hover:underline truncate"
              >
                {displayName}
              </Link>
            )}
            {!post.approved && (
              <span className="ml-auto shrink-0 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-500">
                Pending
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 text-sm text-muted-foreground min-w-0">
            {showCommunity && (
              <>
                <Link
                  to={profileUrl}
                  onClick={(e) => e.stopPropagation()}
                  className="hover:underline truncate"
                >
                  {displayName}
                </Link>
                <span aria-hidden="true">·</span>
              </>
            )}
            <time dateTime={new Date(event.created_at * 1000).toISOString()} className="shrink-0">
              {timeAgo(event.created_at)}
            </time>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mt-2 break-words overflow-hidden">
        <NoteContent event={event} className="text-[15px] leading-relaxed" />
      </div>

      {/* Action bar */}
      <div className="flex items-center mt-3 -ml-2 gap-5">
        <VoteButtons event={event} />
        <Link
          to={detailUrl}
          className="flex items-center gap-1.5 p-2 rounded-full text-muted-foreground transition-colors hover:text-primary hover:bg-primary/10"
          aria-label={`${post.commentCount} comments`}
        >
          <MessageCircle className="size-5" />
          <span className="text-sm tabular-nums">{formatNumber(post.commentCount)}</span>
        </Link>

        {isModerator && !post.approved && onApprove && (
          <button
            type="button"
            disabled={isApproving}
            onClick={(e) => {
              e.stopPropagation();
              onApprove(post);
            }}
            className="ml-auto flex items-center gap-1.5 p-2 rounded-full text-muted-foreground transition-colors hover:text-green-600 hover:bg-green-600/10 disabled:opacity-50"
          >
            <ShieldCheck className="size-5" />
            <span className="text-sm font-medium">Approve</span>
          </button>
        )}
      </div>
    </article>
  );
}

import type { NostrEvent } from '@nostrify/nostrify';
import { MessageCircle, MoreHorizontal, Zap } from 'lucide-react';

import { RepostIcon } from '@/components/icons/RepostIcon';
import { ReactionButton } from '@/components/ReactionButton';
import { RepostMenu } from '@/components/RepostMenu';
import { ZapMenu } from '@/components/ZapMenu';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useEventStats } from '@/hooks/useTrending';
import { useFormatMoney } from '@/hooks/useFormatMoney';
import { formatNumber } from '@/lib/formatNumber';
import { isPeopleListKind, parsePeopleList } from '@/lib/packUtils';
import { cn } from '@/lib/utils';

interface PostActionBarProps {
  event: NostrEvent;
  /** Label and action for the first (reply/comments) button. */
  replyLabel?: string;
  onReply: () => void;
  onMore: () => void;
  /** Extra classes on the outer wrapper div. */
  className?: string;
  /** Optional extra buttons rendered after the Reaction button. */
  extraButtons?: React.ReactNode;
  /** Use compact sizing (smaller icons/padding on mobile). */
  compact?: boolean;
}

export function PostActionBar({
  event,
  replyLabel = 'Reply',
  onReply,
  onMore,
  className,
  extraButtons,
  compact,
}: PostActionBarProps) {
  const { user } = useCurrentUser();
  // Zap button shows for any logged-in user except on their own posts.
  // Exception: people-list events the user authored — they can't zap
  // themselves, but they CAN zap-all-members of their own list (as long as
  // the list has non-self members). The ZapMenu handles the menu-vs-direct
  // decision based on the event kind.
  const isOwnEvent = !!user && user.pubkey === event.pubkey;
  const hasOtherMembers = isPeopleListKind(event.kind)
    && parsePeopleList(event).pubkeys.some((pk) => pk !== user?.pubkey);
  const canZapAuthor = !!user && (!isOwnEvent || hasOtherMembers);

  const { data: stats } = useEventStats(event.id, event);
  const repostTotal = (stats?.reposts ?? 0) + (stats?.quotes ?? 0);
  const { format: formatMoney } = useFormatMoney();

  return (
    <div className={`flex items-center justify-between py-1 border-t border-b border-border${className ? ` ${className}` : ''}`}>
      {/* Reply / Comments */}
      <button
        type="button"
        className={cn("flex items-center gap-1.5 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors", compact ? "p-1.5 sm:p-2" : "p-2")}
        title={replyLabel}
        onClick={onReply}
      >
        <MessageCircle className={compact ? "size-[18px] sm:size-5" : "size-5"} />
        {stats?.replies ? (
          <span className="text-sm tabular-nums">{formatNumber(stats.replies)}</span>
        ) : null}
      </button>

      {/* Repost */}
      <RepostMenu event={event}>
        {(isReposted: boolean) => (
          <button
            type="button"
            className={cn(`flex items-center gap-1.5 rounded-full transition-colors ${isReposted ? 'text-accent hover:text-accent/80 hover:bg-accent/10' : 'text-muted-foreground hover:text-accent hover:bg-accent/10'}`, compact ? "p-1.5 sm:p-2" : "p-2")}
            title={isReposted ? 'Undo repost' : 'Repost'}
          >
            <RepostIcon className={compact ? "size-[18px] sm:size-5" : "size-5"} />
            {repostTotal > 0 ? (
              <span className="text-sm tabular-nums">{formatNumber(repostTotal)}</span>
            ) : null}
          </button>
        )}
      </RepostMenu>

      {/* React */}
      <ReactionButton
        eventId={event.id}
        eventPubkey={event.pubkey}
        eventKind={event.kind}
        reactedEvent={event}
        reactionCount={stats?.reactions}
      />

      {extraButtons}

      {/* Zap */}
      {canZapAuthor && (
        <ZapMenu event={event}>
          <button
            type="button"
            className={cn(
              'flex items-center gap-1.5 rounded-full transition-colors',
              'text-muted-foreground hover:text-amber-500 hover:bg-amber-500/10',
              compact ? "p-1.5 sm:p-2" : "p-2",
            )}
            title="Zap"
          >
            <Zap
              className={compact ? "size-[18px] sm:size-5" : "size-5"}
              fill="none"
            />
            {stats?.zapAmount ? (
              <span className="text-sm tabular-nums">{formatMoney(stats.zapAmount, { layout: 'compact' })}</span>
            ) : null}
          </button>
        </ZapMenu>
      )}

      {/* More */}
      <button
        type="button"
        className={cn("rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors", compact ? "p-1.5 sm:p-2" : "p-2")}
        title="More"
        onClick={onMore}
      >
        <MoreHorizontal className={compact ? "size-[18px] sm:size-5" : "size-5"} />
      </button>
    </div>
  );
}

import type { NostrEvent } from '@nostrify/nostrify';
import { MessageCircle, MoreHorizontal, Zap } from 'lucide-react';
import { useIntl } from 'react-intl';

import { RepostIcon } from '@/components/icons/RepostIcon';
import { ReactionButton } from '@/components/ReactionButton';
import { RepostMenu } from '@/components/RepostMenu';
import { ZapMenu } from '@/components/ZapMenu';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useEventStats, type EventStats } from '@/hooks/useTrending';
import { useFormatMoney } from '@/hooks/useFormatMoney';
import { AnimatedCount } from '@/components/AnimatedCount';
import { isPeopleListKind, parsePeopleList } from '@/lib/packUtils';
import { cn } from '@/lib/utils';
import { impactLight } from '@/lib/haptics';

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
  /** Counts to show instead of the provider's (see `useLiveEventStats`). */
  stats?: EventStats;
}

export function PostActionBar({
  event,
  replyLabel,
  onReply,
  onMore,
  className,
  extraButtons,
  compact,
  stats: statsOverride,
}: PostActionBarProps) {
  const intl = useIntl();
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

  const { data: providerStats } = useEventStats(event.id, event);
  const stats = statsOverride ?? providerStats;
  const repostTotal = (stats?.reposts ?? 0) + (stats?.quotes ?? 0);
  const { format: formatMoney } = useFormatMoney();

  return (
    <div className={`flex items-center justify-between py-1 border-t border-b border-border${className ? ` ${className}` : ''}`}>
      {/* Reply / Comments */}
      <button
        type="button"
        className={cn("flex items-center gap-1.5 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 action-press", compact ? "p-1.5 sm:p-2" : "p-2")}
        title={replyLabel ?? intl.formatMessage({ id: 'postActionBar.reply', defaultMessage: 'Reply' })}
        onClick={() => { impactLight(); onReply(); }}
      >
        <MessageCircle className={compact ? "size-[18px] sm:size-5" : "size-5"} />
        <AnimatedCount value={stats?.replies ?? 0} className="text-sm" />
      </button>

      {/* Repost */}
      <RepostMenu event={event}>
        {(isReposted: boolean) => (
          <button
            type="button"
            className={cn(`flex items-center gap-1.5 rounded-full action-press ${isReposted ? 'text-accent hover:text-accent/80 hover:bg-accent/10' : 'text-muted-foreground hover:text-accent hover:bg-accent/10'}`, compact ? "p-1.5 sm:p-2" : "p-2")}
            title={isReposted
              ? intl.formatMessage({ id: 'postActionBar.undoRepost', defaultMessage: 'Undo repost' })
              : intl.formatMessage({ id: 'postActionBar.repost', defaultMessage: 'Repost' })}
          >
            <RepostIcon className={compact ? "size-[18px] sm:size-5" : "size-5"} />
            <AnimatedCount value={repostTotal} className="text-sm" />
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
              'flex items-center gap-1.5 rounded-full action-press',
              'text-muted-foreground hover:text-amber-500 hover:bg-amber-500/10',
              compact ? "p-1.5 sm:p-2" : "p-2",
            )}
            title={intl.formatMessage({ id: 'postActionBar.zap', defaultMessage: 'Zap' })}
          >
            <Zap
              className={compact ? "size-[18px] sm:size-5" : "size-5"}
              fill="none"
            />
            <AnimatedCount value={stats?.zapAmount ?? 0} format={(n) => formatMoney(n, { layout: 'compact' })} className="text-sm" />
          </button>
        </ZapMenu>
      )}

      {/* More */}
      <button
        type="button"
        className={cn("rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 action-press", compact ? "p-1.5 sm:p-2" : "p-2")}
        title={intl.formatMessage({ id: 'postActionBar.more', defaultMessage: 'More' })}
        onClick={onMore}
      >
        <MoreHorizontal className={compact ? "size-[18px] sm:size-5" : "size-5"} />
      </button>
    </div>
  );
}

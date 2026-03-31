import type { NostrEvent } from '@nostrify/nostrify';
import { MessageCircle, MoreHorizontal, Share2, Zap } from 'lucide-react';
import { nip19 } from 'nostr-tools';
import { useCallback } from 'react';

import { RepostIcon } from '@/components/icons/RepostIcon';
import { ReactionButton } from '@/components/ReactionButton';
import { RepostMenu } from '@/components/RepostMenu';
import { ZapDialog } from '@/components/ZapDialog';
import { useAuthor } from '@/hooks/useAuthor';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useEventStats } from '@/hooks/useTrending';
import { useToast } from '@/hooks/useToast';
import { canZap } from '@/lib/canZap';
import { formatNumber } from '@/lib/formatNumber';
import { shareOrCopy } from '@/lib/share';

interface PostActionBarProps {
  event: NostrEvent;
  /** Label and action for the first (reply/comments) button. */
  replyLabel?: string;
  onReply: () => void;
  onMore: () => void;
  /** Extra classes on the outer wrapper div. */
  className?: string;
}

export function PostActionBar({
  event,
  replyLabel = 'Reply',
  onReply,
  onMore,
  className,
}: PostActionBarProps) {
  const { toast } = useToast();
  const { user } = useCurrentUser();
  const author = useAuthor(event.pubkey);
  const metadata = author.data?.metadata;
  const canZapAuthor = user && canZap(metadata);

  const { data: stats } = useEventStats(event.id, event);
  const repostTotal = (stats?.reposts ?? 0) + (stats?.quotes ?? 0);

  const handleShare = useCallback(async () => {
    let encoded: string;
    if (event.kind >= 30000 && event.kind < 40000) {
      const dTag = event.tags.find(([n]) => n === 'd')?.[1] ?? '';
      encoded = nip19.naddrEncode({ kind: event.kind, pubkey: event.pubkey, identifier: dTag });
    } else if (event.kind >= 10000 && event.kind < 20000) {
      encoded = nip19.naddrEncode({ kind: event.kind, pubkey: event.pubkey, identifier: '' });
    } else {
      encoded = nip19.neventEncode({ id: event.id, author: event.pubkey });
    }
    const url = `${window.location.origin}/${encoded}`;
    const result = await shareOrCopy(url);
    if (result === 'copied') toast({ title: 'Link copied to clipboard' });
  }, [event, toast]);

  return (
    <div className={`flex items-center justify-between py-1 border-t border-b border-border${className ? ` ${className}` : ''}`}>
      {/* Reply / Comments */}
      <button
        className="flex items-center gap-1.5 p-2 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
        title={replyLabel}
        onClick={onReply}
      >
        <MessageCircle className="size-5" />
        {stats?.replies ? (
          <span className="text-sm tabular-nums">{formatNumber(stats.replies)}</span>
        ) : null}
      </button>

      {/* Repost */}
      <RepostMenu event={event}>
        {(isReposted: boolean) => (
          <button
            className={`flex items-center gap-1.5 p-2 rounded-full transition-colors ${isReposted ? 'text-accent hover:text-accent/80 hover:bg-accent/10' : 'text-muted-foreground hover:text-accent hover:bg-accent/10'}`}
            title={isReposted ? 'Undo repost' : 'Repost'}
          >
            <RepostIcon className="size-5" />
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
        reactionCount={stats?.reactions}
      />

      {/* Zap */}
      {canZapAuthor && (
        <ZapDialog target={event}>
          <button
            className="flex items-center gap-1.5 p-2 rounded-full text-muted-foreground hover:text-amber-500 hover:bg-amber-500/10 transition-colors"
            title="Zap"
          >
            <Zap className="size-5" />
            {stats?.zapAmount ? (
              <span className="text-sm tabular-nums">{formatNumber(stats.zapAmount)}</span>
            ) : null}
          </button>
        </ZapDialog>
      )}

      {/* Share */}
      <button
        className="p-2 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors sidebar:hidden"
        title="Share"
        onClick={handleShare}
      >
        <Share2 className="size-5" />
      </button>

      {/* More */}
      <button
        className="p-2 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
        title="More"
        onClick={onMore}
      >
        <MoreHorizontal className="size-5" />
      </button>
    </div>
  );
}

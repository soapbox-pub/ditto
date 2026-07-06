import { ArrowBigDown, ArrowBigUp } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';

import { usePostVotes, type VoteDirection } from '@/hooks/usePostVotes';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useToast } from '@/hooks/useToast';
import { formatNumber } from '@/lib/formatNumber';
import { cn } from '@/lib/utils';

interface VoteButtonsProps {
  event: NostrEvent;
  className?: string;
}

/**
 * Reddit-style up/down vote control backed by NIP-25 reactions
 * (`+` upvote, `-` downvote), styled like Ditto's post action buttons.
 */
export function VoteButtons({ event, className }: VoteButtonsProps) {
  const { user } = useCurrentUser();
  const { toast } = useToast();
  const { score, myVote, vote, isLoading } = usePostVotes(event);

  const handleVote = (e: React.MouseEvent, direction: VoteDirection) => {
    e.stopPropagation();
    e.preventDefault();
    if (!user) {
      toast({ title: 'Log in to vote', variant: 'destructive' });
      return;
    }
    vote(direction);
  };

  return (
    <div className={cn('flex items-center', className)}>
      <button
        type="button"
        onClick={(e) => handleVote(e, '+')}
        aria-label="Upvote"
        aria-pressed={myVote === '+'}
        className={cn(
          'flex items-center gap-1.5 p-2 rounded-full text-muted-foreground transition-colors',
          'hover:text-orange-500 hover:bg-orange-500/10',
          myVote === '+' && 'text-orange-500',
        )}
      >
        <ArrowBigUp className={cn('size-5', myVote === '+' && 'fill-current')} />
        <span
          className={cn(
            'text-sm tabular-nums',
            myVote === '-' && 'text-indigo-500',
          )}
          aria-label={`Score: ${score}`}
        >
          {isLoading ? '' : formatNumber(score)}
        </span>
      </button>
      <button
        type="button"
        onClick={(e) => handleVote(e, '-')}
        aria-label="Downvote"
        aria-pressed={myVote === '-'}
        className={cn(
          'flex items-center p-2 rounded-full text-muted-foreground transition-colors',
          'hover:text-indigo-500 hover:bg-indigo-500/10',
          myVote === '-' && 'text-indigo-500',
        )}
      >
        <ArrowBigDown className={cn('size-5', myVote === '-' && 'fill-current')} />
      </button>
    </div>
  );
}

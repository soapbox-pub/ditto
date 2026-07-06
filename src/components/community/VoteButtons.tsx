import { ArrowBigDown, ArrowBigUp } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';

import { usePostVotes, type VoteDirection } from '@/hooks/usePostVotes';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useToast } from '@/hooks/useToast';
import { formatNumber } from '@/lib/formatNumber';
import { cn } from '@/lib/utils';

interface VoteButtonsProps {
  event: NostrEvent;
  /** Layout direction (default: vertical, Reddit-style left rail). */
  orientation?: 'vertical' | 'horizontal';
  className?: string;
}

/**
 * Reddit-style up/down vote control backed by NIP-25 reactions
 * (`+` upvote, `-` downvote).
 */
export function VoteButtons({ event, orientation = 'vertical', className }: VoteButtonsProps) {
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
    <div
      className={cn(
        'flex items-center gap-0.5',
        orientation === 'vertical' ? 'flex-col' : 'flex-row',
        className,
      )}
    >
      <button
        type="button"
        onClick={(e) => handleVote(e, '+')}
        aria-label="Upvote"
        aria-pressed={myVote === '+'}
        className={cn(
          'p-1 rounded-md transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          myVote === '+' ? 'text-orange-500' : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <ArrowBigUp className={cn('size-5', myVote === '+' && 'fill-current')} />
      </button>
      <span
        className={cn(
          'text-xs font-semibold tabular-nums min-w-6 text-center',
          myVote === '+' && 'text-orange-500',
          myVote === '-' && 'text-indigo-500',
        )}
        aria-label={`Score: ${score}`}
      >
        {isLoading ? '·' : formatNumber(score)}
      </span>
      <button
        type="button"
        onClick={(e) => handleVote(e, '-')}
        aria-label="Downvote"
        aria-pressed={myVote === '-'}
        className={cn(
          'p-1 rounded-md transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          myVote === '-' ? 'text-indigo-500' : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <ArrowBigDown className={cn('size-5', myVote === '-' && 'fill-current')} />
      </button>
    </div>
  );
}

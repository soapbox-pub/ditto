import { useState, useCallback } from 'react';
import { Heart } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { EmojiPicker } from '@/components/EmojiPicker';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { cn } from '@/lib/utils';

interface ReactionButtonProps {
  /** The event ID being reacted to. */
  eventId: string;
  /** The pubkey of the event author. */
  eventPubkey: string;
  /** The kind number of the event being reacted to. */
  eventKind: number;
  /** Current reaction count from stats. */
  reactionCount?: number;
  /** Optional extra class names. */
  className?: string;
}

export function ReactionButton({
  eventId,
  eventPubkey,
  eventKind,
  reactionCount = 0,
  className,
}: ReactionButtonProps) {
  const { user } = useCurrentUser();
  const { mutate: publishEvent } = useNostrPublish();
  const queryClient = useQueryClient();

  const [pickerOpen, setPickerOpen] = useState(false);
  const [userReaction, setUserReaction] = useState<string | null>(null);
  const [optimisticDelta, setOptimisticDelta] = useState(0);

  const displayCount = reactionCount + optimisticDelta;
  const hasReacted = userReaction !== null;

  const handleEmojiSelect = useCallback((emoji: string) => {
    if (!user) return;

    // Close picker immediately
    setPickerOpen(false);

    // Optimistic update
    setUserReaction(emoji);
    setOptimisticDelta((prev) => prev + 1);

    // Publish kind 7 reaction
    publishEvent(
      {
        kind: 7,
        content: emoji,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ['e', eventId],
          ['p', eventPubkey],
          ['k', String(eventKind)],
        ],
      },
      {
        onSuccess: () => {
          // Reset optimistic delta — the refetched stats will include our reaction
          setOptimisticDelta(0);
          // Invalidate stats to refetch real counts
          queryClient.invalidateQueries({ queryKey: ['event-stats', eventId] });
          queryClient.invalidateQueries({ queryKey: ['event-interactions', eventId] });
        },
        onError: () => {
          // Revert optimistic update on failure
          setUserReaction(null);
          setOptimisticDelta((prev) => prev - 1);
        },
      },
    );
  }, [user, eventId, eventPubkey, eventKind, publishEvent, queryClient]);

  return (
    <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            'flex items-center gap-1.5 p-2 rounded-full transition-colors',
            hasReacted
              ? 'text-pink-500'
              : 'text-muted-foreground hover:text-pink-500 hover:bg-pink-500/10',
            className,
          )}
          title="React"
          onClick={(e) => {
            e.stopPropagation();
            if (!user) return;
            setPickerOpen((prev) => !prev);
          }}
        >
          {hasReacted ? (
            <span className="text-base leading-none size-[18px] flex items-center justify-center">{userReaction}</span>
          ) : (
            <Heart className="size-[18px]" />
          )}
          {displayCount > 0 && (
            <span className="text-sm tabular-nums">{displayCount}</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-0 border-border rounded-xl shadow-xl"
        side="top"
        align="center"
        onClick={(e) => e.stopPropagation()}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <EmojiPicker onSelect={handleEmojiSelect} />
      </PopoverContent>
    </Popover>
  );
}

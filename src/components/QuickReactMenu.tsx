import { useState, useCallback, useMemo } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';

import { EmojiPicker } from '@/components/EmojiPicker';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useEmojiUsage } from '@/hooks/useEmojiUsage';
import { cn } from '@/lib/utils';
import type { EventStats } from '@/hooks/useTrending';
import type { ResolvedEmoji } from '@/components/CustomEmoji';

interface QuickReactMenuProps {
  /** The event ID being reacted to. */
  eventId: string;
  /** The pubkey of the event author. */
  eventPubkey: string;
  /** The kind number of the event being reacted to. */
  eventKind: number;
  /** Optional extra class names. */
  className?: string;
}

export function QuickReactMenu({
  eventId,
  eventPubkey,
  eventKind,
  className,
}: QuickReactMenuProps) {
  const { user } = useCurrentUser();
  const { mutate: publishEvent } = useNostrPublish();
  const queryClient = useQueryClient();
  const { trackEmojiUsage, getTopEmojis } = useEmojiUsage();

  const [showFullPicker, setShowFullPicker] = useState(false);
  const [selectedEmoji, setSelectedEmoji] = useState<string | null>(null);

  // Get user's most-used emojis (or defaults)
  const quickEmojis = useMemo(() => getTopEmojis(6), [getTopEmojis]);

  const handleEmojiSelect = useCallback((emoji: string) => {
    if (!user) return;

    // Close picker if it's open
    setShowFullPicker(false);

    // Set selected emoji for optimistic update
    setSelectedEmoji(emoji);

    // Track emoji usage
    trackEmojiUsage(emoji);

    // Optimistically update stats cache immediately
    const displayEmoji = (emoji === '+' || emoji === '') ? '👍' : emoji;
    const resolvedEmoji: ResolvedEmoji = { content: displayEmoji };
    const prevStats = queryClient.getQueryData<EventStats>(['event-stats', eventId]);
    if (prevStats) {
      queryClient.setQueryData<EventStats>(['event-stats', eventId], {
        ...prevStats,
        reactions: prevStats.reactions + 1,
        reactionEmojis: prevStats.reactionEmojis.some((e) => e.content === displayEmoji)
          ? prevStats.reactionEmojis
          : [...prevStats.reactionEmojis, resolvedEmoji],
      });
    }

    // Store user's own reaction for this event
    queryClient.setQueryData<ResolvedEmoji>(['user-reaction', eventId], resolvedEmoji);

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
          // Delay invalidation so the relay has time to index the new event.
          // Without this, the refetch returns stale counts and overwrites
          // the optimistic update.
          setTimeout(() => {
            queryClient.invalidateQueries({ queryKey: ['event-stats', eventId] });
            queryClient.invalidateQueries({ queryKey: ['event-interactions', eventId] });
          }, 3000);
        },
        onError: () => {
          // Revert optimistic update on failure
          setSelectedEmoji(null);
          // Revert stats
          if (prevStats) {
            queryClient.setQueryData<EventStats>(['event-stats', eventId], prevStats);
          }
          // Remove user reaction
          queryClient.removeQueries({ queryKey: ['user-reaction', eventId] });
        },
      },
    );
  }, [user, eventId, eventPubkey, eventKind, publishEvent, queryClient, trackEmojiUsage]);

  if (!user) return null;

  // Show full emoji picker if requested
  if (showFullPicker) {
    return (
      <div
        className={cn('bg-popover border border-border rounded-xl shadow-xl', className)}
        onClick={(e) => e.stopPropagation()}
      >
        <EmojiPicker onSelect={handleEmojiSelect} />
      </div>
    );
  }

  // Show quick react menu
  return (
    <div
      className={cn(
        'inline-flex items-center gap-1 p-1.5 rounded-full bg-popover border border-border shadow-lg',
        className,
      )}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Quick emoji buttons */}
      {quickEmojis.map((emoji) => (
        <button
          key={emoji}
          onClick={() => handleEmojiSelect(emoji)}
          className={cn(
            'flex items-center justify-center size-9 rounded-full text-xl transition-all hover:bg-accent hover:scale-110 active:scale-95',
            selectedEmoji === emoji && 'bg-accent scale-110',
          )}
          title={`React with ${emoji}`}
        >
          {emoji}
        </button>
      ))}

      {/* More button to show full picker */}
      <button
        onClick={() => setShowFullPicker(true)}
        className="flex items-center justify-center size-9 rounded-full text-muted-foreground transition-all hover:bg-accent hover:text-foreground hover:scale-110 active:scale-95"
        title="More reactions"
      >
        <MoreHorizontal className="size-5" />
      </button>
    </div>
  );
}

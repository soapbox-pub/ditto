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
  /** Called after an emoji is selected so the parent can close the popover. */
  onClose?: () => void;
  /** Called when the full picker is opened/closed so the parent can lock the popover open. */
  onExpandChange?: (expanded: boolean) => void;
  /**
   * Optional custom handler called when an emoji is selected.
   * When provided, this replaces the default kind 7 publish behavior.
   */
  onReact?: (emoji: string) => void;
  /** Optional extra class names. */
  className?: string;
}

export function QuickReactMenu({
  eventId,
  eventPubkey,
  eventKind,
  onClose,
  onExpandChange,
  onReact,
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

    // Close the entire popover (don't reset showFullPicker first — that
    // causes the quick-select to flash before the popover unmounts).
    onClose?.();

    // Set selected emoji for optimistic update
    setSelectedEmoji(emoji);

    // Track emoji usage
    trackEmojiUsage(emoji);

    // If a custom handler is provided, delegate to it and skip the default kind 7 publish.
    if (onReact) {
      onReact(emoji);
      return;
    }

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
  }, [user, eventId, eventPubkey, eventKind, onReact, publishEvent, queryClient, trackEmojiUsage, onClose]);

  if (!user) return null;

  if (showFullPicker) {
    return (
      <div
        className={cn('rounded-xl shadow-xl overflow-hidden', className)}
        onClick={(e) => e.stopPropagation()}
      >
        <EmojiPicker onSelect={handleEmojiSelect} />
      </div>
    );
  }

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
            'flex items-center justify-center size-9 rounded-full text-xl transition-all hover:bg-secondary hover:scale-110 active:scale-95',
            selectedEmoji === emoji && 'bg-secondary scale-110',
          )}
          title={`React with ${emoji}`}
        >
          {emoji}
        </button>
      ))}

      {/* More button to show full picker */}
      <button
        onClick={() => {
          setShowFullPicker(true);
          onExpandChange?.(true);
        }}
        className="flex items-center justify-center size-9 rounded-full text-muted-foreground transition-all hover:bg-secondary hover:text-foreground hover:scale-110 active:scale-95"
        title="More reactions"
      >
        <MoreHorizontal className="size-5" />
      </button>
    </div>
  );
}

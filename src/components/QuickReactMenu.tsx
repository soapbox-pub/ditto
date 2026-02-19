import { useState, useCallback } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { EmojiPicker } from '@/components/EmojiPicker';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { cn } from '@/lib/utils';

interface QuickReactMenuProps {
  /** The event ID being reacted to. */
  eventId: string;
  /** The pubkey of the event author. */
  eventPubkey: string;
  /** The kind number of the event being reacted to. */
  eventKind: number;
  /** Quick emoji options to display. */
  quickEmojis?: string[];
  /** Optional extra class names. */
  className?: string;
}

// Default quick reaction emojis matching Ditto style
const DEFAULT_QUICK_EMOJIS = ['❤️', '😂', '💯', '🔥', '👍', '📌'];

export function QuickReactMenu({
  eventId,
  eventPubkey,
  eventKind,
  quickEmojis = DEFAULT_QUICK_EMOJIS,
  className,
}: QuickReactMenuProps) {
  const { user } = useCurrentUser();
  const { mutate: publishEvent } = useNostrPublish();
  const queryClient = useQueryClient();

  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedEmoji, setSelectedEmoji] = useState<string | null>(null);

  const handleEmojiSelect = useCallback((emoji: string) => {
    if (!user) return;

    // Close picker if it's open
    setPickerOpen(false);

    // Set selected emoji for optimistic update
    setSelectedEmoji(emoji);

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
          // Invalidate stats to refetch real counts
          queryClient.invalidateQueries({ queryKey: ['event-stats', eventId] });
          queryClient.invalidateQueries({ queryKey: ['event-interactions', eventId] });
        },
        onError: () => {
          // Revert optimistic update on failure
          setSelectedEmoji(null);
        },
      },
    );
  }, [user, eventId, eventPubkey, eventKind, publishEvent, queryClient]);

  if (!user) return null;

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

      {/* More button with full picker */}
      <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
        <PopoverTrigger asChild>
          <button
            className="flex items-center justify-center size-9 rounded-full text-muted-foreground transition-all hover:bg-accent hover:text-foreground hover:scale-110 active:scale-95"
            title="More reactions"
          >
            <MoreHorizontal className="size-5" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="w-auto p-0 border-border rounded-xl shadow-xl"
          side="top"
          align="end"
          onClick={(e) => e.stopPropagation()}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <EmojiPicker onSelect={handleEmojiSelect} />
        </PopoverContent>
      </Popover>
    </div>
  );
}

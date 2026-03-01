import { useState, useRef, useCallback } from 'react';
import { Heart } from 'lucide-react';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { QuickReactMenu } from '@/components/QuickReactMenu';
import { RenderResolvedEmoji } from '@/components/CustomEmoji';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useUserReaction } from '@/hooks/useUserReaction';
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
  const [menuOpen, setMenuOpen] = useState(false);
  const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const justClosedRef = useRef(false);
  const pickerExpandedRef = useRef(false);
  const userReaction = useUserReaction(eventId);

  const hasReacted = !!userReaction;

  const handleMouseEnter = useCallback(() => {
    if (!user) return;
    if (justClosedRef.current) return;
    // Clear any pending close timeout
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    setMenuOpen(true);
  }, [user]);

  const handleMouseLeave = useCallback(() => {
    // Don't auto-close when the full emoji picker is open
    if (pickerExpandedRef.current) return;
    // Delay closing to allow user to move to the menu
    closeTimeoutRef.current = setTimeout(() => {
      setMenuOpen(false);
    }, 150);
  }, []);

  return (
    <Popover open={menuOpen} onOpenChange={(open) => {
      if (open && justClosedRef.current) return;
      if (!open) pickerExpandedRef.current = false;
      setMenuOpen(open);
    }}>
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
            if (justClosedRef.current) return;
            setMenuOpen((prev) => !prev);
          }}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {hasReacted && userReaction ? (
            <span className="size-6 flex items-center justify-center leading-none">
              <RenderResolvedEmoji emoji={userReaction} className="inline-block h-6 w-6" />
            </span>
          ) : (
            <Heart className="size-5" />
          )}
          {reactionCount > 0 && (
            <span className={cn('text-sm tabular-nums', hasReacted && 'text-pink-500')}>{reactionCount}</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-0 border-0 bg-transparent shadow-none"
        side="top"
        align="start"
        onClick={(e) => e.stopPropagation()}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <QuickReactMenu
          eventId={eventId}
          eventPubkey={eventPubkey}
          eventKind={eventKind}
          onExpandChange={(expanded) => {
            pickerExpandedRef.current = expanded;
          }}
          onClose={() => {
            pickerExpandedRef.current = false;
            justClosedRef.current = true;
            setMenuOpen(false);
            setTimeout(() => {
              justClosedRef.current = false;
            }, 300);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

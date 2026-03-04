import { useState, useRef, useCallback } from 'react';
import { Heart } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { QuickReactMenu } from '@/components/QuickReactMenu';
import { RenderResolvedEmoji } from '@/components/CustomEmoji';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useUserReaction } from '@/hooks/useUserReaction';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { cn } from '@/lib/utils';
import type { EventStats } from '@/hooks/useTrending';
import type { ResolvedEmoji } from '@/lib/customEmoji';

/** The default emoji used for a quick tap/click reaction. */
const DEFAULT_REACTION = '💜';

/** Long-press threshold in ms to open the emoji picker on touch devices. */
const LONG_PRESS_MS = 400;

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
  /** Show a filled heart icon instead of outline. */
  filledHeart?: boolean;
}

export function ReactionButton({
  eventId,
  eventPubkey,
  eventKind,
  reactionCount = 0,
  className,
  filledHeart = false,
}: ReactionButtonProps) {
  const { user } = useCurrentUser();
  const { nostr } = useNostr();
  const { mutate: publishEvent } = useNostrPublish();
  const queryClient = useQueryClient();
  const [menuOpen, setMenuOpen] = useState(false);
  const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const justClosedRef = useRef(false);
  const pickerExpandedRef = useRef(false);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const longPressFiredRef = useRef(false);
  const userReaction = useUserReaction(eventId);

  const hasReacted = !!userReaction;

  /** Publish a default 💜 reaction on tap/click. */
  const handleQuickReact = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    if (!user) return;

    const emoji = DEFAULT_REACTION;
    const resolvedEmoji: ResolvedEmoji = { content: emoji };

    // Optimistic update
    const prevStats = queryClient.getQueryData<EventStats>(['event-stats', eventId]);
    if (prevStats) {
      queryClient.setQueryData<EventStats>(['event-stats', eventId], {
        ...prevStats,
        reactions: prevStats.reactions + 1,
        reactionEmojis: prevStats.reactionEmojis.some((e) => e.content === emoji)
          ? prevStats.reactionEmojis
          : [...prevStats.reactionEmojis, resolvedEmoji],
      });
    }
    queryClient.setQueryData<ResolvedEmoji>(['user-reaction', eventId], resolvedEmoji);

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
          setTimeout(() => {
            queryClient.invalidateQueries({ queryKey: ['event-stats', eventId] });
            queryClient.invalidateQueries({ queryKey: ['event-interactions', eventId] });
          }, 3000);
        },
        onError: () => {
          if (prevStats) {
            queryClient.setQueryData<EventStats>(['event-stats', eventId], prevStats);
          }
          queryClient.removeQueries({ queryKey: ['user-reaction', eventId] });
        },
      },
    );
  }, [user, eventId, eventPubkey, eventKind, publishEvent, queryClient]);

  const handleUnreact = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) return;

    // Find the user's kind 7 event ID to delete
    const events = await nostr.query([{
      kinds: [7],
      authors: [user.pubkey],
      '#e': [eventId],
      limit: 1,
    }]);

    if (events.length === 0) return;

    const reactionEventId = events[0].id;

    // Snapshot for rollback
    const prevReaction = queryClient.getQueryData(['user-reaction', eventId]);
    const prevStats = queryClient.getQueryData<EventStats>(['event-stats', eventId]);

    // Optimistic update: clear reaction and decrement count
    queryClient.setQueryData(['user-reaction', eventId], null);
    if (prevStats) {
      queryClient.setQueryData<EventStats>(['event-stats', eventId], {
        ...prevStats,
        reactions: Math.max(0, prevStats.reactions - 1),
      });
    }

    publishEvent(
      { kind: 5, content: '', tags: [['e', reactionEventId], ['k', '7']] },
      {
        onSuccess: () => {
          setTimeout(() => {
            queryClient.invalidateQueries({ queryKey: ['event-stats', eventId] });
            queryClient.invalidateQueries({ queryKey: ['event-interactions', eventId] });
            queryClient.invalidateQueries({ queryKey: ['user-reaction', eventId] });
          }, 3000);
        },
        onError: () => {
          // Rollback
          queryClient.setQueryData(['user-reaction', eventId], prevReaction);
          if (prevStats) {
            queryClient.setQueryData<EventStats>(['event-stats', eventId], prevStats);
          }
        },
      },
    );
  }, [user, nostr, eventId, publishEvent, queryClient]);

  // --- Hover handlers (desktop): show popover ---
  const handleMouseEnter = useCallback(() => {
    if (!user) return;
    if (justClosedRef.current) return;
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    setMenuOpen(true);
  }, [user]);

  const handleMouseLeave = useCallback(() => {
    if (pickerExpandedRef.current) return;
    closeTimeoutRef.current = setTimeout(() => {
      setMenuOpen(false);
    }, 150);
  }, []);

  // --- Long-press handlers (touch): show popover ---
  const handleTouchStart = useCallback(() => {
    if (!user) return;
    longPressFiredRef.current = false;
    longPressTimerRef.current = setTimeout(() => {
      longPressFiredRef.current = true;
      setMenuOpen(true);
    }, LONG_PRESS_MS);
  }, [user]);

  const handleTouchEnd = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const handleTouchMove = useCallback(() => {
    // Cancel long press if user moves finger
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
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
            'text-muted-foreground hover:text-pink-500 hover:bg-pink-500/10',
            className,
            hasReacted && 'text-pink-500',
          )}
          title="React"
          onClick={(e) => {
            e.stopPropagation();
            if (!user) return;
            // If long-press opened the popover, don't also fire a click
            if (longPressFiredRef.current) {
              longPressFiredRef.current = false;
              return;
            }
            if (hasReacted) {
              handleUnreact(e);
              return;
            }
            handleQuickReact(e);
          }}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onTouchMove={handleTouchMove}
        >
          {filledHeart ? (
            <Heart className="size-6" fill={hasReacted ? 'currentColor' : 'none'} />
          ) : hasReacted && userReaction ? (
            <RenderResolvedEmoji emoji={userReaction} className="size-5 leading-none translate-y-px" />
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

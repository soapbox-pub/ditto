import { useState, useRef, useCallback, useEffect } from 'react';
import { Heart } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { QuickReactMenu } from '@/components/QuickReactMenu';
import { RenderResolvedEmoji } from '@/components/CustomEmoji';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useUserReaction } from '@/hooks/useUserReaction';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { rebroadcastEvent } from '@/lib/rebroadcastEvent';
import { isCustomEmoji } from '@/lib/customEmoji';
import { formatNumber } from '@/lib/formatNumber';
import { impactLight, impactMedium } from '@/lib/haptics';
import { cn } from '@/lib/utils';
import type { EventStats } from '@/hooks/useTrending';
import type { NostrEvent } from '@nostrify/nostrify';

interface ReactionButtonProps {
  /** The event ID being reacted to. */
  eventId: string;
  /** The pubkey of the event author. */
  eventPubkey: string;
  /** The kind number of the event being reacted to. */
  eventKind: number;
  /**
   * The full event being reacted to. When provided, it is rebroadcast to relays
   * alongside the reaction (best-effort).
   */
  reactedEvent?: NostrEvent;
  /** Current reaction count from stats. */
  reactionCount?: number;
  /** Optional extra class names. */
  className?: string;
  /** Show a filled heart icon instead of outline. */
  filledHeart?: boolean;
}

/**
 * Send-side reaction burst: particles radiating from the icon when the user
 * reacts — small copies of the chosen emoji, or pink dots as the fallback —
 * plus a shockwave ring and a squash-and-release pop of the icon itself.
 * Deterministic geometry: evenly spaced rays at a uniform radius so the
 * burst reads as a circle, angled so no ray points straight down into the
 * card's overflow-hidden edge. The spark/halo layers detonate 90ms after
 * the icon starts its squash (see the `reaction-*` animations in the
 * tailwind config) so the whole thing lands as one percussive hit.
 */
const BURST_RADIUS = 24;
const BURST_RAY_COUNT = 8;
const BURST_RAYS = Array.from({ length: BURST_RAY_COUNT }, (_, i) => {
  const angle = (i / BURST_RAY_COUNT) * Math.PI * 2 - Math.PI / 2 + Math.PI / BURST_RAY_COUNT;
  return {
    x: Math.cos(angle) * BURST_RADIUS,
    y: Math.sin(angle) * BURST_RADIUS,
    color: i % 2 === 0 ? '#ec4899' : '#f9a8d4',
  };
});

/** Covers the 90ms detonation delay + 0.6s spark animation. */
const BURST_DURATION_MS = 800;

export function ReactionButton({
  eventId,
  eventPubkey,
  eventKind,
  reactedEvent,
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
  const userReaction = useUserReaction(eventId);

  const hasReacted = !!userReaction;

  // Send-side burst feedback. Triggered explicitly from the two react paths
  // (double-click ❤️ and QuickReactMenu pick) rather than by watching
  // `hasReacted`, which also flips when the relay query resolves an old
  // reaction on load. The burst echoes the chosen emoji; custom emojis
  // (`:shortcode:` image reactions) fall back to pink dots since their
  // images turn to mud at particle size.
  const [burst, setBurst] = useState<{ emoji?: string } | null>(null);
  const triggerBurst = useCallback((emoji?: string) => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    setBurst({ emoji: emoji && !isCustomEmoji(emoji) ? emoji : undefined });
  }, []);
  useEffect(() => {
    if (!burst) return;
    const timeout = setTimeout(() => setBurst(null), BURST_DURATION_MS);
    return () => clearTimeout(timeout);
  }, [burst]);

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

  const handleMouseEnter = useCallback(() => {
    if (!user) return;
    if (hasReacted) return;
    if (justClosedRef.current) return;
    // Clear any pending close timeout
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    setMenuOpen(true);
  }, [user, hasReacted]);

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
            'flex items-center gap-1.5 p-2 rounded-full transition-colors focus:outline-none',
            'text-muted-foreground hover:text-pink-500 hover:bg-pink-500/10',
            className,
            hasReacted && 'text-pink-500',
          )}
          title="React"
          onClick={(e) => {
            e.stopPropagation();
            if (!user) return;
            if (hasReacted) {
              impactLight();
              handleUnreact(e);
              return;
            }
            if (justClosedRef.current) return;
            setMenuOpen((prev) => !prev);
          }}
          onDoubleClick={(e) => {
            e.stopPropagation();
            if (!user) return;
            if (hasReacted) return;
            impactMedium();
            triggerBurst('❤️');
            setMenuOpen(false);
            const prevStats = queryClient.getQueryData<EventStats>(['event-stats', eventId]);
            queryClient.setQueryData(['user-reaction', eventId], { content: '❤️' });
            if (prevStats) {
              queryClient.setQueryData<EventStats>(['event-stats', eventId], {
                ...prevStats,
                reactions: prevStats.reactions + 1,
              });
            }
            publishEvent(
              {
                kind: 7,
                content: '❤️',
                tags: [['e', eventId], ['p', eventPubkey], ['k', String(eventKind)]],
              },
              {
                onSuccess: () => {
                  // Rebroadcast the original event alongside the reaction (best-effort).
                  if (reactedEvent) rebroadcastEvent(nostr, reactedEvent);
                  setTimeout(() => {
                    queryClient.invalidateQueries({ queryKey: ['event-stats', eventId] });
                    queryClient.invalidateQueries({ queryKey: ['event-interactions', eventId] });
                    queryClient.invalidateQueries({ queryKey: ['user-reaction', eventId] });
                  }, 3000);
                },
                onError: () => {
                  queryClient.setQueryData(['user-reaction', eventId], null);
                  if (prevStats) {
                    queryClient.setQueryData<EventStats>(['event-stats', eventId], prevStats);
                  }
                },
              },
            );
          }}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <span className="relative flex items-center justify-center">
            <span
              className={cn(
                'flex items-center justify-center',
                burst && 'motion-safe:animate-reaction-pop',
              )}
            >
              {filledHeart ? (
                <Heart className="size-6" fill={hasReacted ? 'currentColor' : 'none'} />
              ) : hasReacted && userReaction ? (
                <RenderResolvedEmoji emoji={userReaction} className="h-5 w-5 object-contain leading-none translate-y-px" />
              ) : (
                <Heart className="size-5" />
              )}
            </span>
            {burst && (
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 flex items-center justify-center motion-reduce:hidden"
              >
                {/* Shockwave ring */}
                <span className="absolute size-6 rounded-full border-2 border-pink-500/60 animate-reaction-halo" />
                {BURST_RAYS.map((ray, i) => (
                  <span
                    key={i}
                    className={cn(
                      'absolute animate-reaction-spark select-none',
                      !burst.emoji && 'size-1.5 rounded-full',
                    )}
                    style={{
                      fontSize: burst.emoji ? 12 : undefined,
                      lineHeight: burst.emoji ? 1 : undefined,
                      backgroundColor: burst.emoji ? undefined : ray.color,
                      '--spark-x': `${ray.x}px`,
                      '--spark-y': `${ray.y}px`,
                    } as React.CSSProperties}
                  >
                    {burst.emoji}
                  </span>
                ))}
              </span>
            )}
          </span>
          {reactionCount > 0 && (
            <span className={cn('text-sm tabular-nums', hasReacted && 'text-pink-500')}>{formatNumber(reactionCount)}</span>
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
          reactedEvent={reactedEvent}
          onReacted={triggerBurst}
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

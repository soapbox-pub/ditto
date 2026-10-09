import { useState, useRef, useCallback, useEffect } from 'react';
import { Heart } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';

import { AnchoredPopover } from '@/components/AnchoredPopover';
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
  const buttonRef = useRef<HTMLButtonElement>(null);
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

    // Optimistic update first, so the heart empties on tap.
    const prevReaction = queryClient.getQueryData(['user-reaction', eventId]);
    queryClient.setQueryData(['user-reaction', eventId], null);

    // Find the user's reactions to delete. The pool includes ones published
    // from this device that relays haven't indexed yet (see reconcileOwnEvents).
    let reactions: NostrEvent[];
    try {
      reactions = await nostr.query([{ kinds: [7], authors: [user.pubkey], '#e': [eventId] }]);
    } catch {
      queryClient.setQueryData(['user-reaction', eventId], prevReaction);
      return;
    }
    if (reactions.length === 0) return;

    publishEvent(
      // The `p` tag sends the deletion to the author's inbox relays, where
      // the reaction was delivered too (see useNostrPublish).
      {
        kind: 5,
        content: '',
        tags: [...reactions.map(({ id }) => ['e', id]), ['k', '7'], ['p', eventPubkey]],
      },
      {
        onSuccess: () => {
          setTimeout(() => {
            queryClient.invalidateQueries({ queryKey: ['event-interactions', eventId] });
            queryClient.invalidateQueries({ queryKey: ['user-reaction', eventId] });
          }, 3000);
        },
        onError: () => {
          queryClient.setQueryData(['user-reaction', eventId], prevReaction);
        },
      },
    );
  }, [user, nostr, eventId, eventPubkey, publishEvent, queryClient]);

  // Hover only for pointers that can hover. A first tap on Android WebView
  // emits emulated enter events before the click, so opening here would let
  // the click's toggle close the menu again, leaving just a sticky-hover heart.
  const handleMouseEnter = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return;
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

  const handleMouseLeave = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return;
    // Don't auto-close when the full emoji picker is open
    if (pickerExpandedRef.current) return;
    // Delay closing to allow user to move to the menu
    closeTimeoutRef.current = setTimeout(() => {
      setMenuOpen(false);
    }, 150);
  }, []);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={menuOpen}
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
          queryClient.setQueryData(['user-reaction', eventId], { content: '❤️' });
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
                  queryClient.invalidateQueries({ queryKey: ['event-interactions', eventId] });
                  queryClient.invalidateQueries({ queryKey: ['user-reaction', eventId] });
                }, 3000);
              },
              onError: () => {
                queryClient.setQueryData(['user-reaction', eventId], null);
              },
            },
          );
        }}
        onPointerEnter={handleMouseEnter}
        onPointerLeave={handleMouseLeave}
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
      <AnchoredPopover
        open={menuOpen}
        onOpenChange={(open) => {
          if (open && justClosedRef.current) return;
          if (!open) pickerExpandedRef.current = false;
          setMenuOpen(open);
        }}
        anchorRef={buttonRef}
        className="w-auto p-0 border-0 bg-transparent shadow-none"
        side="top"
        align="start"
        onClick={(e) => e.stopPropagation()}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onPointerEnter={handleMouseEnter}
        onPointerLeave={handleMouseLeave}
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
      </AnchoredPopover>
    </>
  );
}

// src/blobbi/rooms/components/BlobbiRoomShell.tsx

/**
 * BlobbiRoomShell — The outer layout for the room-based Blobbi dashboard.
 *
 * Manages:
 * - Current room state + navigation
 * - Sleep dark overlay (scoped to this shell only)
 * - Ephemeral poop instances (local-only, no persistence)
 */

import { useState, useCallback, useMemo, useEffect, type CSSProperties } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useIsMobile } from '@/hooks/useIsMobile';

import { cn } from '@/lib/utils';
import { toast } from '@/hooks/useToast';
import {
  type BlobbiRoomId,
  ROOM_META,
  DEFAULT_ROOM_ORDER,
  DEFAULT_INITIAL_ROOM,
  getNextRoom,
  getPreviousRoom,
  getRoomIndex,
} from '../lib/room-config';
import type { BlobbiRoomContext, RoomPoopState } from '../lib/room-types';
import {
  generateInitialPoops,
  removePoop,
  type PoopInstance,
} from '../lib/poop-system';

import { BlobbiHomeRoom } from './BlobbiHomeRoom';
import { BlobbiKitchenRoom } from './BlobbiKitchenRoom';
import { BlobbiCareRoom } from './BlobbiCareRoom';
import { BlobbiHatcheryRoom } from './BlobbiHatcheryRoom';
import { BlobbiRestRoom } from './BlobbiRestRoom';
import { BlobbiClosetRoom } from './BlobbiClosetRoom';

// ─── Types ────────────────────────────────────────────────────────────────────

interface BlobbiRoomShellProps {
  ctx: BlobbiRoomContext;
  roomOrder?: BlobbiRoomId[];
  initialRoom?: BlobbiRoomId;
}

interface RoomNavState {
  current: BlobbiRoomId;
  direction: 'left' | 'right' | null;
}

// ─── Room Component Map ───────────────────────────────────────────────────────

const ROOM_COMPONENTS: Record<BlobbiRoomId, React.ComponentType<{ ctx: BlobbiRoomContext; poopState: RoomPoopState }>> = {
  care: BlobbiCareRoom,
  kitchen: BlobbiKitchenRoom,
  home: BlobbiHomeRoom,
  hatchery: BlobbiHatcheryRoom,
  rest: BlobbiRestRoom,
  closet: BlobbiClosetRoom,
};

// ─── Component ────────────────────────────────────────────────────────────────

export function BlobbiRoomShell({
  ctx,
  roomOrder = DEFAULT_ROOM_ORDER,
  initialRoom = DEFAULT_INITIAL_ROOM,
}: BlobbiRoomShellProps) {
  const [nav, setNav] = useState<RoomNavState>({
    current: roomOrder.includes(initialRoom) ? initialRoom : roomOrder[0],
    direction: null,
  });

  const goRight = useCallback(() => {
    setNav(prev => ({
      current: getNextRoom(prev.current, roomOrder),
      direction: 'right',
    }));
  }, [roomOrder]);

  const goLeft = useCallback(() => {
    setNav(prev => ({
      current: getPreviousRoom(prev.current, roomOrder),
      direction: 'left',
    }));
  }, [roomOrder]);

  const meta = ROOM_META[nav.current];
  const roomIndex = getRoomIndex(nav.current, roomOrder);
  const RoomComponent = ROOM_COMPONENTS[nav.current];

  const dots = useMemo(() => roomOrder.map((id, i) => ({
    id,
    active: i === roomIndex,
    label: ROOM_META[id].label,
  })), [roomOrder, roomIndex]);

  // ─── Destination labels for nav arrows ───
  const leftDest = ROOM_META[getPreviousRoom(nav.current, roomOrder)];
  const rightDest = ROOM_META[getNextRoom(nav.current, roomOrder)];
  const isMobile = useIsMobile();

  const isSleeping = ctx.isSleeping;

  // ─── Poop system (ephemeral, local-only) ───
  const [poops, setPoops] = useState<PoopInstance[]>([]);
  const [shovelMode, setShovelMode] = useState(false);

  // Generate poop on mount
  useEffect(() => {
    const hunger = ctx.currentStats.hunger;
    const lastFeed = ctx.lastFeedTimestamp ?? ctx.companion.lastInteraction * 1000;
    setPoops(generateInitialPoops(hunger, lastFeed));
  // Only run once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onRemovePoop = useCallback((poopId: string) => {
    setPoops(prev => {
      const { remaining, xpReward } = removePoop(prev, poopId);
      if (xpReward > 0) {
        toast({ title: `+${xpReward} XP`, description: 'Cleaned up!' });
      }
      if (remaining.length === 0) {
        setShovelMode(false);
      }
      return remaining;
    });
  }, []);

  const poopState: RoomPoopState = useMemo(() => ({
    poops,
    shovelMode,
    setShovelMode,
    onRemovePoop,
  }), [poops, shovelMode, onRemovePoop]);

  return (
    <div className="flex flex-col flex-1 min-h-0 relative">
      {/* ── Room Content — fills the entire shell ── */}
      <div className="flex-1 min-h-0 flex flex-col relative">
        <RoomComponent ctx={ctx} poopState={poopState} />
      </div>

      {/* ── Sleep overlay — darkens the room when Blobbi sleeps ── */}
      {isSleeping && (
        <div
          className="absolute inset-0 z-20 pointer-events-none transition-opacity duration-700"
          style={{ background: 'radial-gradient(ellipse at 50% 40%, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.45) 100%)' }}
        />
      )}

      {/* ── Floating Room Header ── */}
      <div className="absolute inset-x-0 top-0 z-30 pointer-events-none">
        <div className="flex flex-col items-center pt-2 pb-2">
          <div
            className={cn(
              'flex items-center gap-1.5 pointer-events-auto',
              'px-3 py-1 rounded-full',
              'bg-background/60 backdrop-blur-md',
              'shadow-sm border border-border/20',
            )}
          >
            <span className="text-sm">{meta.icon}</span>
            <span className="text-xs sm:text-sm font-semibold text-foreground/80">{meta.label}</span>
          </div>
          <div className="flex items-center gap-1.5 mt-1.5">
            {dots.map(dot => (
              <div
                key={dot.id}
                className={cn(
                  'rounded-full transition-all duration-300',
                  dot.active
                    ? 'w-4 h-1.5 bg-primary shadow-sm'
                    : 'w-1.5 h-1.5 bg-foreground/20',
                )}
                title={dot.label}
              />
            ))}
          </div>
        </div>
      </div>

      {/* ── Left / Right Navigation Arrows with destination labels ── */}
      <button
        onClick={goLeft}
        className={cn(
          'group absolute left-0.5 top-1/2 -translate-y-1/2 z-40',
          'flex items-center gap-0',
          'text-foreground/50 hover:text-foreground/80',
          'transition-all duration-200 active:scale-95',
          'cursor-pointer select-none',
          'rounded-full pl-1 pr-1.5 py-1.5',
          'bg-background/40 backdrop-blur-sm',
          'hover:bg-background/60',
          'shadow-sm',
        )}
        aria-label={`Go to ${leftDest.label}`}
      >
        <ChevronLeft
          className="size-5 shrink-0 transition-transform duration-300 group-hover:scale-110"
          style={{ animation: 'room-arrow-nudge-left 2.5s ease-in-out infinite' } as CSSProperties}
        />
        <span
          className={cn(
            'text-[10px] font-medium leading-none whitespace-nowrap',
            'transition-all duration-200',
            isMobile
              ? 'max-w-[60px] opacity-70'
              : 'max-w-0 opacity-0 group-hover:max-w-[80px] group-hover:opacity-80 group-focus-visible:max-w-[80px] group-focus-visible:opacity-80',
            'overflow-hidden',
          )}
        >
          {leftDest.label}
        </span>
      </button>

      <button
        onClick={goRight}
        className={cn(
          'group absolute right-0.5 top-1/2 -translate-y-1/2 z-40',
          'flex items-center gap-0',
          'text-foreground/50 hover:text-foreground/80',
          'transition-all duration-200 active:scale-95',
          'cursor-pointer select-none',
          'rounded-full pr-1 pl-1.5 py-1.5',
          'bg-background/40 backdrop-blur-sm',
          'hover:bg-background/60',
          'shadow-sm',
        )}
        aria-label={`Go to ${rightDest.label}`}
      >
        <span
          className={cn(
            'text-[10px] font-medium leading-none whitespace-nowrap',
            'transition-all duration-200',
            isMobile
              ? 'max-w-[60px] opacity-70'
              : 'max-w-0 opacity-0 group-hover:max-w-[80px] group-hover:opacity-80 group-focus-visible:max-w-[80px] group-focus-visible:opacity-80',
            'overflow-hidden',
          )}
        >
          {rightDest.label}
        </span>
        <ChevronRight
          className="size-5 shrink-0 transition-transform duration-300 group-hover:scale-110"
          style={{ animation: 'room-arrow-nudge-right 2.5s ease-in-out infinite' } as CSSProperties}
        />
      </button>
    </div>
  );
}

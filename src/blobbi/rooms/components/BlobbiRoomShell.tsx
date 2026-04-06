// src/blobbi/rooms/components/BlobbiRoomShell.tsx

/**
 * BlobbiRoomShell — The outer layout for the room-based Blobbi dashboard.
 *
 * The shell renders the room as one continuous surface:
 * - Room header (label + dots) floats absolutely over the room content
 * - Room navigation arrows float absolutely on the sides
 * - The room component fills the entire area
 *
 * This avoids the "stacked panels" look where header, content, and footer
 * appear as separate background blocks.
 *
 * Future animation branch:
 * - `direction` in nav state tells which way the user navigated.
 */

import { useState, useCallback, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { cn } from '@/lib/utils';
import {
  type BlobbiRoomId,
  ROOM_META,
  DEFAULT_ROOM_ORDER,
  DEFAULT_INITIAL_ROOM,
  getNextRoom,
  getPreviousRoom,
  getRoomIndex,
} from '../lib/room-config';
import type { BlobbiRoomContext } from '../lib/room-types';

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

const ROOM_COMPONENTS: Record<BlobbiRoomId, React.ComponentType<{ ctx: BlobbiRoomContext }>> = {
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

  return (
    <div className="flex flex-col flex-1 min-h-0 relative">
      {/* ── Room Content — fills the entire shell ── */}
      <div className="flex-1 min-h-0 flex flex-col relative">
        <RoomComponent ctx={ctx} />
      </div>

      {/* ── Floating Room Header — absolutely positioned over content ── */}
      <div className="absolute inset-x-0 top-0 z-30 pointer-events-none">
        <div className="flex flex-col items-center pt-2 pb-1">
          {/* Room label */}
          <div className="flex items-center gap-1.5 pointer-events-auto">
            <span className="text-sm">{meta.icon}</span>
            <span className="text-xs sm:text-sm font-semibold text-foreground/70">{meta.label}</span>
          </div>
          {/* Indicator dots */}
          <div className="flex items-center gap-1.5 mt-1">
            {dots.map(dot => (
              <div
                key={dot.id}
                className={cn(
                  'rounded-full transition-all duration-300',
                  dot.active
                    ? 'w-4 h-1 bg-primary'
                    : 'w-1 h-1 bg-muted-foreground/20',
                )}
                title={dot.label}
              />
            ))}
          </div>
        </div>
      </div>

      {/* ── Left / Right Navigation Arrows — absolutely positioned ── */}
      <button
        onClick={goLeft}
        className={cn(
          'absolute left-0.5 top-1/2 -translate-y-1/2 z-40',
          'size-9 rounded-full flex items-center justify-center',
          'text-muted-foreground/40 hover:text-foreground/70 hover:bg-accent/40',
          'transition-all duration-200 active:scale-90',
        )}
        aria-label={`Go to ${ROOM_META[getPreviousRoom(nav.current, roomOrder)].label}`}
      >
        <ChevronLeft className="size-5" />
      </button>
      <button
        onClick={goRight}
        className={cn(
          'absolute right-0.5 top-1/2 -translate-y-1/2 z-40',
          'size-9 rounded-full flex items-center justify-center',
          'text-muted-foreground/40 hover:text-foreground/70 hover:bg-accent/40',
          'transition-all duration-200 active:scale-90',
        )}
        aria-label={`Go to ${ROOM_META[getNextRoom(nav.current, roomOrder)].label}`}
      >
        <ChevronRight className="size-5" />
      </button>
    </div>
  );
}

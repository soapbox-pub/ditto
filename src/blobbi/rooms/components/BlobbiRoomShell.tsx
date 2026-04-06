// src/blobbi/rooms/components/BlobbiRoomShell.tsx

/**
 * BlobbiRoomShell — The outer layout for the room-based Blobbi dashboard.
 *
 * Responsibilities:
 * 1. Manages the current room state
 * 2. Renders left/right navigation arrows
 * 3. Shows the room label indicator
 * 4. Delegates room content to the appropriate room component
 *
 * The shell does NOT own any Blobbi domain logic — it only owns
 * which room is displayed and provides the navigation chrome.
 *
 * Future animation branch:
 * - The `currentRoom` / `direction` state already provides enough
 *   information to drive enter/exit CSS transitions or framer-motion
 *   variants. The `direction` field ('left' | 'right' | null) can be
 *   used to pick the animation direction.
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
  /** All room context passed through to the active room */
  ctx: BlobbiRoomContext;
  /**
   * Room sequence. Defaults to DEFAULT_ROOM_ORDER.
   * Later this can come from user preferences.
   */
  roomOrder?: BlobbiRoomId[];
  /** Which room to start on. Defaults to DEFAULT_INITIAL_ROOM ('home'). */
  initialRoom?: BlobbiRoomId;
}

/**
 * Internal navigation state.
 * `direction` is kept for future animation: it tells which way the user navigated.
 */
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

  // Resolve the room component to render
  const RoomComponent = ROOM_COMPONENTS[nav.current];

  // Room indicator dots
  const dots = useMemo(() => roomOrder.map((id, i) => ({
    id,
    active: i === roomIndex,
    label: ROOM_META[id].label,
  })), [roomOrder, roomIndex]);

  return (
    <div className="flex flex-col flex-1 min-h-0 relative">
      {/* ── Room Header — label + dots ── */}
      <div className="relative z-30 flex items-center justify-center gap-2 pt-2.5 pb-1.5">
        {/* Room label */}
        <div className="flex items-center gap-1.5">
          <span className="text-base">{meta.icon}</span>
          <span className="text-sm font-semibold text-foreground/80">{meta.label}</span>
        </div>
      </div>

      {/* ── Room indicator dots ── */}
      <div className="relative z-30 flex items-center justify-center gap-1.5 pb-2">
        {dots.map(dot => (
          <div
            key={dot.id}
            className={cn(
              'rounded-full transition-all duration-300',
              dot.active
                ? 'w-5 h-1.5 bg-primary'
                : 'w-1.5 h-1.5 bg-muted-foreground/25',
            )}
            title={dot.label}
          />
        ))}
      </div>

      {/* ── Room Content Area ── */}
      {/*
        This is where future animation will happen.
        The `direction` in nav state tells which way to animate.
        For now, we simply render the active room instantly.
      */}
      <div className="flex-1 min-h-0 relative">
        <RoomComponent ctx={ctx} />
      </div>

      {/* ── Left / Right Navigation Arrows ── */}
      <button
        onClick={goLeft}
        className={cn(
          'absolute left-1 top-1/2 -translate-y-1/2 z-40',
          'size-10 rounded-full flex items-center justify-center',
          'text-muted-foreground/50 hover:text-foreground/80 hover:bg-accent/50',
          'transition-all duration-200 active:scale-90',
        )}
        aria-label={`Go to ${ROOM_META[getPreviousRoom(nav.current, roomOrder)].label}`}
      >
        <ChevronLeft className="size-6" />
      </button>
      <button
        onClick={goRight}
        className={cn(
          'absolute right-1 top-1/2 -translate-y-1/2 z-40',
          'size-10 rounded-full flex items-center justify-center',
          'text-muted-foreground/50 hover:text-foreground/80 hover:bg-accent/50',
          'transition-all duration-200 active:scale-90',
        )}
        aria-label={`Go to ${ROOM_META[getNextRoom(nav.current, roomOrder)].label}`}
      >
        <ChevronRight className="size-6" />
      </button>
    </div>
  );
}

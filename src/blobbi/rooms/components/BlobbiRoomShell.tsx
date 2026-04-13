/**
 * BlobbiRoomShell — Outer layout for room-based navigation.
 *
 * Manages: room navigation (arrows + dots), sleep overlay, poop state.
 * Renders children in a flex column with the hero above and children below.
 * The parent decides what bottom bar to render based on the active room.
 */

import { useState, useCallback, useMemo, useEffect, useRef as useReactRef, type CSSProperties } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/useToast';

import {
  type BlobbiRoomId,
  ROOM_META,
  DEFAULT_ROOM_ORDER,
  getNextRoom,
  getPreviousRoom,
} from '../lib/room-config';
import {
  generateInitialPoops,
  removePoop,
  type PoopInstance,
} from '../lib/poop-system';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PoopState {
  poops: PoopInstance[];
  shovelMode: boolean;
  setShovelMode: React.Dispatch<React.SetStateAction<boolean>>;
  onRemovePoop: (poopId: string) => void;
}

interface BlobbiRoomShellProps {
  /** Current active room */
  roomId: BlobbiRoomId;
  /** Called when user navigates to a different room */
  onChangeRoom: (roomId: BlobbiRoomId) => void;
  /** Whether the Blobbi is sleeping (darkens the room) */
  isSleeping: boolean;
  /** Hero element (BlobbiRoomHero) rendered in the flex-1 area */
  hero: React.ReactNode;
  /** Bottom bar content (per-room actions + carousel) */
  children: React.ReactNode;
  /** Optional content between hero and bottom bar (inline music/sing) */
  middleSlot?: React.ReactNode;
  /** Room order (defaults to DEFAULT_ROOM_ORDER) */
  roomOrder?: BlobbiRoomId[];
  /** Poop generation params */
  hunger: number;
  lastFeedTimestamp: number | undefined;
  /** Expose poop state to children via render prop or context */
  poopStateRef?: React.MutableRefObject<PoopState | null>;
}

// ─── Component ────────────────────────────────────────────────────────────────

/** Minimum horizontal swipe distance (px) to trigger room change */
const SWIPE_THRESHOLD = 50;

export function BlobbiRoomShell({
  roomId,
  onChangeRoom,
  isSleeping,
  hero,
  children,
  middleSlot,
  roomOrder = DEFAULT_ROOM_ORDER,
  hunger,
  lastFeedTimestamp,
  poopStateRef,
}: BlobbiRoomShellProps) {
  const goLeft = useCallback(() => {
    onChangeRoom(getPreviousRoom(roomId, roomOrder));
  }, [roomId, roomOrder, onChangeRoom]);

  const goRight = useCallback(() => {
    onChangeRoom(getNextRoom(roomId, roomOrder));
  }, [roomId, roomOrder, onChangeRoom]);

  const leftDest = ROOM_META[getPreviousRoom(roomId, roomOrder)];
  const rightDest = ROOM_META[getNextRoom(roomId, roomOrder)];

  // ─── Touch swipe ───
  const touchStartX = useReactRef<number | null>(null);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  }, [touchStartX]);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(dx) < SWIPE_THRESHOLD) return;
    if (dx > 0) goLeft();
    else goRight();
  }, [touchStartX, goLeft, goRight]);

  // ─── Poop system (ephemeral) ───
  const [poops, setPoops] = useState<PoopInstance[]>([]);
  const [shovelMode, setShovelMode] = useState(false);

  useEffect(() => {
    setPoops(generateInitialPoops(hunger, lastFeedTimestamp));
  // Only on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onRemovePoop = useCallback((poopId: string) => {
    setPoops(prev => {
      const { remaining, xpReward } = removePoop(prev, poopId);
      if (xpReward > 0) {
        toast({ title: `+${xpReward} XP`, description: 'Cleaned up!' });
      }
      if (remaining.length === 0) setShovelMode(false);
      return remaining;
    });
  }, []);

  const poopState: PoopState = useMemo(() => ({
    poops, shovelMode, setShovelMode, onRemovePoop,
  }), [poops, shovelMode, onRemovePoop]);

  if (poopStateRef) poopStateRef.current = poopState;

  return (
    <div
      className="flex flex-col flex-1 min-h-0 relative"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Room content */}
      <div className="flex-1 min-h-0 flex flex-col relative">
        {hero}
        {middleSlot}
        {children}
      </div>

      {/* Sleep overlay */}
      {isSleeping && (
        <div
          className="absolute inset-0 z-20 pointer-events-none transition-opacity duration-700"
          style={{ background: 'radial-gradient(ellipse at 50% 40%, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.45) 100%)' }}
        />
      )}

      {/* Navigation arrows */}
      <button
        onClick={goLeft}
        className={cn(
          'group absolute left-1 top-1/2 -translate-y-1/2 z-40',
          'flex items-center justify-center',
          'size-10 sm:size-12 rounded-full',
          'text-muted-foreground/30 hover:text-foreground/60 hover:bg-accent/40',
          'transition-all duration-200 active:scale-90',
          'cursor-pointer select-none',
        )}
        aria-label={`Go to ${leftDest.label}`}
      >
        <ChevronLeft
          className="size-7 sm:size-8 shrink-0"
          strokeWidth={4}
          style={{ animation: 'room-arrow-nudge-left 2.5s ease-in-out infinite' } as CSSProperties}
        />
      </button>

      <button
        onClick={goRight}
        className={cn(
          'group absolute right-1 top-1/2 -translate-y-1/2 z-40',
          'flex items-center justify-center',
          'size-10 sm:size-12 rounded-full',
          'text-muted-foreground/30 hover:text-foreground/60 hover:bg-accent/40',
          'transition-all duration-200 active:scale-90',
          'cursor-pointer select-none',
        )}
        aria-label={`Go to ${rightDest.label}`}
      >
        <ChevronRight
          className="size-7 sm:size-8 shrink-0"
          strokeWidth={4}
          style={{ animation: 'room-arrow-nudge-right 2.5s ease-in-out infinite' } as CSSProperties}
        />
      </button>
    </div>
  );
}

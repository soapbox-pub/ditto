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
import { impactLight } from '@/lib/haptics';

import {
  type BlobbiRoomId,
  ROOM_META,
  DEFAULT_ROOM_ORDER,
  getNextRoom,
  getPreviousRoom,
  getRoomIndex,
} from '../lib/room-config';
import {
  generateInitialPoops,
  addPoop as addPoopInstance,
  removePoop,
  type PoopInstance,
} from '../lib/poop-system';
import { type RoomLayout, ROOM_FLOOR_RATIO } from '../lib/room-layout-schema';
import { getSurfaceBackground } from '../lib/room-surface-background';
import { ROOM_CONTROL_SURFACE_SUBTLE, ROOM_GUIDE_RING, ROOM_GUIDE_RING_PULSE } from '../lib/room-layout';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PoopState {
  poops: PoopInstance[];
  onRemovePoop: (poopId: string) => void;
  /** Spawn a single poop (e.g. from overfeeding). */
  addPoop: (source?: PoopInstance['source']) => void;
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
  /**
   * Stage overlay — absolutely positioned Blobbi visual (BlobbiRoomStage).
   * Rendered as a direct child of the shell so it shares the same coordinate
   * system as the wall/floor background layers.
   */
  stageOverlay?: React.ReactNode;
  /**
   * Stats HUD — rendered in the top overlay area below the room header.
   * Absolutely positioned so it does not affect Blobbi stage layout.
   */
  statusHud?: React.ReactNode;
  /** Room order (defaults to DEFAULT_ROOM_ORDER) */
  roomOrder?: BlobbiRoomId[];
  /** Poop generation params */
  hunger: number;
  lastFeedTimestamp: number | undefined;
  /** Expose poop state to children via render prop or context */
  poopStateRef?: React.MutableRefObject<PoopState | null>;
  /** Called when a poop is cleaned. Parent handles toast/XP persistence. */
  onPoopCleaned?: () => void;
  /** When set, the matching room-nav arrow glows to guide the user. */
  guideRoomDirection?: 'left' | 'right' | null;
  /** Visual layout (wall/floor) for the current room. */
  roomLayout?: RoomLayout;
  /** Optional editor trigger rendered top-right corner of the room. */
  editorSlot?: React.ReactNode;
  /**
   * Optional editor overlay — rendered as a direct child of the shell so
   * `absolute inset-0` covers only the room area, not sidebars.
   */
  editorOverlay?: React.ReactNode;
  /** Whether the top HUD (room header + stats) is visible. Hide when drawer is open. */
  hudVisible?: boolean;
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
  stageOverlay,
  statusHud,
  roomOrder = DEFAULT_ROOM_ORDER,
  hunger,
  lastFeedTimestamp,
  poopStateRef,
  onPoopCleaned,
  guideRoomDirection,
  roomLayout,
  editorSlot,
  editorOverlay,
  hudVisible = true,
}: BlobbiRoomShellProps) {
  const goLeft = useCallback(() => {
    onChangeRoom(getPreviousRoom(roomId, roomOrder));
  }, [roomId, roomOrder, onChangeRoom]);

  const goRight = useCallback(() => {
    onChangeRoom(getNextRoom(roomId, roomOrder));
  }, [roomId, roomOrder, onChangeRoom]);

  const leftDest = ROOM_META[getPreviousRoom(roomId, roomOrder)];
  const rightDest = ROOM_META[getNextRoom(roomId, roomOrder)];
  const roomMeta = ROOM_META[roomId];
  const roomIndex = getRoomIndex(roomId, roomOrder);

  // ─── Touch swipe ───
  const touchStartX = useReactRef<number | null>(null);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    // If the touch started on a food-drag handle (the carousel food button),
    // skip the swipe — that gesture drives a food drag, not a room change.
    // This check is synchronous (DOM attribute), so it works even before
    // React re-renders with the drag state from the same pointerdown.
    if ((e.target as HTMLElement).closest?.('[data-food-drag]')) return;
    touchStartX.current = e.touches[0].clientX;
  }, [touchStartX]);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(dx) < SWIPE_THRESHOLD) return;
    impactLight();
    if (dx > 0) goLeft();
    else goRight();
  }, [touchStartX, goLeft, goRight]);

  // ─── Poop system (ephemeral) ───
  const [poops, setPoops] = useState<PoopInstance[]>([]);
  useEffect(() => {
    setPoops(generateInitialPoops(hunger, lastFeedTimestamp));
  // Only on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onRemovePoop = useCallback((poopId: string) => {
    setPoops(prev => {
      const { remaining } = removePoop(prev, poopId);
      if (remaining.length < prev.length) {
        onPoopCleaned?.();
      }
      return remaining;
    });
  }, [onPoopCleaned]);

  const addPoop = useCallback((source: PoopInstance['source'] = 'overfeed') => {
    setPoops(prev => addPoopInstance(prev, source));
  }, []);

  const poopState: PoopState = useMemo(() => ({
    poops, onRemovePoop, addPoop,
  }), [poops, onRemovePoop, addPoop]);

  if (poopStateRef) poopStateRef.current = poopState;

  // ─── Room background styles (decorative, from validated layout) ───
  const wallBackground = useMemo((): string | undefined => {
    if (!roomLayout) return undefined;
    return getSurfaceBackground(roomLayout.wall);
  }, [roomLayout]);

  const floorBackground = useMemo((): string | undefined => {
    if (!roomLayout) return undefined;
    return getSurfaceBackground(roomLayout.floor);
  }, [roomLayout]);

  return (
    <div
      className="flex flex-col flex-1 min-h-0 relative"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Room background layers (decorative, behind all content) */}
      {roomLayout && (
        <>
          {wallBackground && (
            <div
              className="absolute inset-x-0 top-0 pointer-events-none"
              style={{ background: wallBackground, bottom: `${ROOM_FLOOR_RATIO * 100}%` }}
              aria-hidden
            />
          )}
          {floorBackground && (
            <div
              className="absolute inset-x-0 bottom-0 pointer-events-none"
              style={{ background: floorBackground, top: `${(1 - ROOM_FLOOR_RATIO) * 100}%` }}
              aria-hidden
            />
          )}
          {/* Baseboard — shadow/highlight pair at wall/floor boundary */}
          <div
            className="absolute inset-x-0 pointer-events-none z-[1] flex flex-col"
            style={{ top: `${(1 - ROOM_FLOOR_RATIO) * 100}%` }}
            aria-hidden
          >
            <div className="h-px bg-foreground/10" />
            <div className="h-0.5 bg-background/15" />
          </div>
          {/* Floor depth — subtle top shadow on the floor area */}
          <div
            className="absolute inset-x-0 h-3 pointer-events-none z-[1]"
            style={{
              top: `${(1 - ROOM_FLOOR_RATIO) * 100}%`,
              background: 'linear-gradient(to bottom, hsl(var(--foreground) / 0.06), transparent)',
            }}
            aria-hidden
          />
        </>
      )}

      {/* Stage overlay — Blobbi visual anchored to the shell's ground line */}
      {stageOverlay && (
        <div className="absolute inset-0 z-10 pointer-events-none">
          {stageOverlay}
        </div>
      )}

      {/* Room header — icon + label + dot indicator, below tab bar */}
      <div className={cn(
        'absolute top-14 inset-x-0 z-30 flex flex-col items-center pointer-events-none gap-2 transition-opacity duration-200',
        !hudVisible && 'opacity-0 pointer-events-none',
      )}>
        <div className="pointer-events-auto flex flex-col items-center gap-0.5 py-1 px-3 rounded-full bg-background/60 backdrop-blur-sm">
          <div className="flex items-center gap-1.5">
            <roomMeta.icon className="size-3.5 text-foreground/50" />
            <span className="text-xs font-semibold text-foreground/60">{roomMeta.label}</span>
          </div>
          <div className="flex items-center gap-1">
            {roomOrder.map((id, i) => (
              <div
                key={id}
                className={cn(
                  'rounded-full transition-all duration-300',
                  i === roomIndex ? 'w-3 h-1 bg-primary' : 'w-1 h-1 bg-muted-foreground/20',
                )}
              />
            ))}
          </div>
        </div>
        {/* Stats HUD row */}
        {statusHud && (
          <div className="pointer-events-auto">
            {statusHud}
          </div>
        )}
      </div>

      {/* Room content */}
      <div className="flex-1 min-h-0 flex flex-col relative">
        {hero}
        {middleSlot}
        {children}
      </div>

      {/* Room editor trigger (upper-right, below tab bar overlay) */}
      {editorSlot && (
        <div className={cn(
          'absolute top-14 right-3 z-[55] transition-opacity duration-200',
          !hudVisible && 'opacity-0 pointer-events-none',
        )}>
          {editorSlot}
        </div>
      )}

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
          ROOM_CONTROL_SURFACE_SUBTLE,
          'text-muted-foreground/60 hover:text-foreground/80 hover:bg-background/70',
          'transition-all duration-200 active:scale-90',
          'cursor-pointer select-none',
          guideRoomDirection === 'left' && [ROOM_GUIDE_RING, ROOM_GUIDE_RING_PULSE],
        )}
        aria-label={`Go to ${leftDest.label}`}
      >
        <ChevronLeft
          className="size-7 sm:size-8 shrink-0"
          strokeWidth={4}
          style={guideRoomDirection !== 'left' ? { animation: 'room-arrow-nudge-left 2.5s ease-in-out infinite' } as CSSProperties : undefined}
        />
      </button>

      <button
        onClick={goRight}
        className={cn(
          'group absolute right-1 top-1/2 -translate-y-1/2 z-40',
          'flex items-center justify-center',
          'size-10 sm:size-12 rounded-full',
          ROOM_CONTROL_SURFACE_SUBTLE,
          'text-muted-foreground/60 hover:text-foreground/80 hover:bg-background/70',
          'transition-all duration-200 active:scale-90',
          'cursor-pointer select-none',
          guideRoomDirection === 'right' && [ROOM_GUIDE_RING, ROOM_GUIDE_RING_PULSE],
        )}
        aria-label={`Go to ${rightDest.label}`}
      >
        <ChevronRight
          className="size-7 sm:size-8 shrink-0"
          strokeWidth={4}
          style={guideRoomDirection !== 'right' ? { animation: 'room-arrow-nudge-right 2.5s ease-in-out infinite' } as CSSProperties : undefined}
        />
      </button>

      {/* Editor overlay — absolute to the shell, covers only this column */}
      {editorOverlay}
    </div>
  );
}

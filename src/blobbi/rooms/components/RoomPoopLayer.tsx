/**
 * RoomPoopLayer — Poop rendering and shovel button components.
 *
 * Currently all poops spawn in the kitchen, but the rendering is
 * room-aware: each overlay filters by `poop.room` so enabling
 * multi-room spawning later only requires changing the spawn
 * location in `poop-system.ts`.
 *
 * - `PoopOverlay`: display-only poop emojis (any room)
 * - `InteractivePoopOverlay`: poop emojis with drag hit-test refs (kitchen)
 * - `ShovelButton`: draggable shovel action button (kitchen only)
 */

import { Shovel } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/useToast';

import type { PoopState } from './BlobbiRoomShell';
import type { BlobbiRoomId } from '../lib/room-config';
import { getPoopsInRoom } from '../lib/poop-system';
import { RoomActionButton } from './RoomActionButton';
import type { ShovelDrag } from '../hooks/useShovelDrag';

// ─── PoopOverlay (passive, any room) ──────────────────────────────────────────

/**
 * Static poop display. Shows all poops regardless of which room they
 * spawned in — the mess follows the Blobbi everywhere.
 */
export function PoopOverlay({ poopStateRef }: { poopStateRef: React.MutableRefObject<PoopState | null> }) {
  const poopState = poopStateRef.current;
  if (!poopState || poopState.poops.length === 0) return null;
  const poops = poopState.poops;

  return (
    <>
      {poops.map((poop) => (
        <div
          key={poop.id}
          className="absolute z-10 pointer-events-none select-none"
          style={{ bottom: `${poop.position.bottom}%`, left: `${poop.position.left}%` }}
        >
          <span className="text-2xl sm:text-3xl block">💩</span>
        </div>
      ))}
    </>
  );
}

// ─── InteractivePoopOverlay (kitchen) ─────────────────────────────────────────

/**
 * Interactive poop display. Renders poops assigned to `roomId`,
 * registers refs for drag hit-testing, and shows the drag ghost.
 */
export function InteractivePoopOverlay({ drag, poopStateRef, roomId }: { drag: ShovelDrag; poopStateRef: React.MutableRefObject<PoopState | null>; roomId: BlobbiRoomId }) {
  const poopState = poopStateRef.current;
  const poops = poopState ? getPoopsInRoom(poopState.poops, roomId) : [];
  if (poops.length === 0 && !drag.isDragging) return null;

  return (
    <>
      {poops.map((poop) => (
        <div
          key={poop.id}
          ref={(el) => {
            if (el) drag.poopRefs.current.set(poop.id, el);
            else drag.poopRefs.current.delete(poop.id);
          }}
          className={cn(
            'absolute z-10 transition-transform duration-200 pointer-events-none select-none',
            drag.hoveredPoopId === poop.id && drag.isDragging && 'scale-150',
          )}
          style={{ bottom: `${poop.position.bottom}%`, left: `${poop.position.left}%` }}
        >
          <span className={cn('text-2xl sm:text-3xl block', drag.isDragging && 'drop-shadow-lg')}>
            💩
          </span>
        </div>
      ))}

      {drag.isDragging && drag.dragPos && (
        <div
          className="fixed z-[60] pointer-events-none"
          style={{ left: drag.dragPos.x, top: drag.dragPos.y, transform: 'translate(-50%, -50%)' }}
        >
          <div className="size-14 sm:size-20 rounded-full flex items-center justify-center text-amber-600 bg-amber-500/15 ring-2 ring-amber-500/40 shadow-lg">
            <Shovel className="size-7 sm:size-9" />
          </div>
        </div>
      )}
    </>
  );
}

// ─── ShovelButton (kitchen only) ──────────────────────────────────────────────

interface ShovelButtonProps {
  drag: ShovelDrag;
  guideActionGlow?: string | null;
}

/**
 * Draggable shovel action button. Kitchen only.
 */
export function ShovelButton({ drag, guideActionGlow }: ShovelButtonProps) {
  return (
    <RoomActionButton
      ref={drag.shovelRef}
      icon={<Shovel className="size-7 sm:size-9" />}
      label="Shovel"
      color="text-stone-500"
      glowHex="#78716c"
      onClick={() => {
        if (!drag.anyPoop) {
          toast({ title: 'Nothing to clean!', description: 'Your Blobbi hasn\'t made a mess.' });
        }
      }}
      onMouseDown={drag.anyPoop ? drag.onMouseDown : undefined}
      onTouchStart={drag.anyPoop ? drag.onTouchStart : undefined}
      onTouchMove={drag.anyPoop ? drag.onTouchMove : undefined}
      onTouchEnd={drag.anyPoop ? drag.onTouchEnd : undefined}
      className={cn(drag.anyPoop && 'touch-action-none', drag.isDragging && 'opacity-30')}
      glow={drag.anyPoop && guideActionGlow === 'clean'}
    />
  );
}

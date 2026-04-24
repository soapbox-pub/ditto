/**
 * RoomPoopLayer — Poop rendering and shovel button components.
 *
 * Poops spawn in the kitchen but are visible in every room.
 * - `PassivePoopOverlay`: display-only poop emojis (all non-kitchen rooms)
 * - `KitchenPoopOverlay`: interactive poop emojis with drag hit-test refs
 * - `ShovelButton`: draggable shovel action button (kitchen only)
 */

import { Shovel } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/useToast';

import type { PoopState } from './BlobbiRoomShell';
import { RoomActionButton } from './RoomActionButton';
import type { ShovelDrag } from '../hooks/useShovelDrag';

// ─── PassivePoopOverlay (non-kitchen rooms) ───────────────────────────────────

/**
 * Static poop display for non-kitchen rooms. No interaction.
 */
export function PassivePoopOverlay({ poopStateRef }: { poopStateRef: React.MutableRefObject<PoopState | null> }) {
  const poopState = poopStateRef.current;
  if (!poopState || poopState.poops.length === 0) return null;

  return (
    <>
      {poopState.poops.map((poop) => (
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

// ─── KitchenPoopOverlay (interactive) ─────────────────────────────────────────

/**
 * Interactive poop display for the kitchen.
 * Registers refs for drag hit-testing and renders the drag ghost.
 */
export function KitchenPoopOverlay({ drag, poopStateRef }: { drag: ShovelDrag; poopStateRef: React.MutableRefObject<PoopState | null> }) {
  const poopState = poopStateRef.current;
  if (!poopState || (poopState.poops.length === 0 && !drag.isDragging)) return null;

  return (
    <>
      {poopState.poops.map((poop) => (
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

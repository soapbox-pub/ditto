/**
 * RoomPoopLayer — Shared poop rendering and shovel button for all rooms.
 *
 * `PoopOverlay` renders the poop emojis + dragging ghost.
 * `ShovelButton` renders the draggable shovel action button.
 *
 * Both must share the same `useShovelDrag` instance so the ShovelButton's
 * drag can hit-test the poop elements registered by PoopOverlay.
 */

import { Shovel } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/useToast';

import { RoomActionButton } from './RoomActionButton';
import type { ShovelDrag } from '../hooks/useShovelDrag';

// ─── Component: PoopOverlay ───────────────────────────────────────────────────

interface PoopOverlayProps {
  drag: ShovelDrag;
}

/**
 * Renders the poop emojis and the dragging ghost.
 * Must be placed inside a `position: relative` container (the room view).
 */
export function PoopOverlay({ drag }: PoopOverlayProps) {
  const { roomPoops, isDragging, dragPos, hoveredPoopId, poopRefs } = drag;

  if (roomPoops.length === 0 && !isDragging) return null;

  return (
    <>
      {roomPoops.map((poop) => (
        <div
          key={poop.id}
          ref={(el) => {
            if (el) poopRefs.current.set(poop.id, el);
            else poopRefs.current.delete(poop.id);
          }}
          className={cn(
            'absolute z-10 transition-transform duration-200 pointer-events-none select-none',
            hoveredPoopId === poop.id && isDragging && 'scale-150',
          )}
          style={{ bottom: `${poop.position.bottom}%`, left: `${poop.position.left}%` }}
        >
          <span className={cn('text-2xl sm:text-3xl block', isDragging && 'drop-shadow-lg')}>
            💩
          </span>
        </div>
      ))}

      {isDragging && dragPos && (
        <div
          className="fixed z-[60] pointer-events-none"
          style={{ left: dragPos.x, top: dragPos.y, transform: 'translate(-50%, -50%)' }}
        >
          <div className="size-14 sm:size-20 rounded-full flex items-center justify-center text-amber-600 bg-amber-500/15 ring-2 ring-amber-500/40 shadow-lg">
            <Shovel className="size-7 sm:size-9" />
          </div>
        </div>
      )}
    </>
  );
}

// ─── Component: ShovelButton ──────────────────────────────────────────────────

interface ShovelButtonProps {
  drag: ShovelDrag;
  /** Guide glow when `guideActionGlow === 'clean'`. */
  guideActionGlow?: string | null;
}

/**
 * Draggable shovel action button. Always rendered; shows a toast when
 * tapped without poop present.
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
        if (!drag.anyPoopInRoom) {
          toast({
            title: 'Nothing to clean here!',
            description: drag.anyPoopGlobal ? 'Try another room.' : 'Your Blobbi hasn\'t made a mess.',
          });
        }
      }}
      onMouseDown={drag.anyPoopInRoom ? drag.onMouseDown : undefined}
      onTouchStart={drag.anyPoopInRoom ? drag.onTouchStart : undefined}
      onTouchMove={drag.anyPoopInRoom ? drag.onTouchMove : undefined}
      onTouchEnd={drag.anyPoopInRoom ? drag.onTouchEnd : undefined}
      className={cn(drag.anyPoopInRoom && 'touch-action-none', drag.isDragging && 'opacity-30')}
      glow={drag.anyPoopInRoom && guideActionGlow === 'clean'}
    />
  );
}

/**
 * RoomPoopLayer — poop on the room floor, and the shovel that cleans it up.
 *
 * Poop follows the Blobbi into every room; the shovel lives in the kitchen.
 * The shovel is dragged with useRoomDrag: while it moves, the poop under it
 * is marked `data-hovered` (straight on the DOM, so nothing re-renders), and
 * letting go over one cleans it.
 */

import { Shovel } from 'lucide-react';
import { useIntl } from 'react-intl';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/useToast';

import type { PoopInstance } from '../lib/poop-system';
import { RoomActionButton } from './RoomActionButton';

/** Poop stands on its floor anchor, sized with the room (see BlobbiRoomShell anchors). */
const POOP_CLASS = 'absolute bottom-0 left-0 block -translate-x-1/2 leading-none transition-transform duration-200 data-[hovered]:scale-150 data-[hovered]:drop-shadow-lg';
const POOP_STYLE: React.CSSProperties = { fontSize: 'clamp(18px, calc(var(--anchor-px, 40) * 0.55px), 44px)' };

export function PoopOverlay({ poops }: { poops: PoopInstance[] }) {
  return poops.map((poop) => (
    <div
      key={poop.id}
      data-anchor="floor"
      data-x={poop.position.x}
      data-z={poop.position.z}
      className="absolute left-0 top-0 pointer-events-none select-none"
    >
      <span data-poop-id={poop.id} className={POOP_CLASS} style={POOP_STYLE}>💩</span>
    </div>
  ));
}

interface ShovelButtonProps {
  hasPoop: boolean;
  /** The shovel is out, being dragged. */
  dragging: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  /** Click or keyboard activation with poop around: clean one up without dragging. */
  onClean?: () => void;
  glow?: boolean;
}

export function ShovelButton({ hasPoop, dragging, onPointerDown, onClean, glow }: ShovelButtonProps) {
  const intl = useIntl();
  return (
    <RoomActionButton
      icon={<Shovel />}
      label={intl.formatMessage({ id: 'blobbiRoom.shovel.label', defaultMessage: 'Shovel' })}
      color="text-stone-500"
      glowHex="#78716c"
      onClick={() => {
        if (hasPoop) onClean?.();
        else {
          toast({
            title: intl.formatMessage({ id: 'blobbiRoom.shovel.nothing', defaultMessage: 'Nothing to clean!' }),
            description: intl.formatMessage({ id: 'blobbiRoom.shovel.nothingDescription', defaultMessage: 'Your Blobbi hasn’t made a mess.' }),
          });
        }
      }}
      onPointerDown={hasPoop ? onPointerDown : undefined}
      className={cn(hasPoop && 'touch-none', dragging && 'opacity-30')}
      glow={hasPoop && glow}
    />
  );
}

/** The shovel under the finger while dragging. */
export function ShovelGhost() {
  return (
    <div className="size-14 sm:size-20 rounded-full flex items-center justify-center text-amber-600 bg-amber-500/15 ring-2 ring-amber-500/40 shadow-lg">
      <Shovel className="size-7 sm:size-9" />
    </div>
  );
}

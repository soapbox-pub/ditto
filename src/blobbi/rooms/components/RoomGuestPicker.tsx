/**
 * RoomGuestPicker — the user's other Blobbis, to invite into the room.
 *
 * Drag one into the room to have it visit where you drop it, or tap to
 * invite it (or send it home). Visiting ones are marked.
 */

import { Check } from 'lucide-react';
import { FormattedMessage, useIntl } from 'react-intl';

import { BlobbiStageVisual } from '@/blobbi/ui/BlobbiStageVisual';
import { cn } from '@/lib/utils';
import type { BlobbiCompanion } from '@blobbi-kit/core/blobbi';

interface RoomGuestPickerProps {
  /** The user's Blobbis other than the one in the room. */
  companions: BlobbiCompanion[];
  /** d-tags of the ones visiting now. */
  visiting: Set<string>;
  onPointerDown: (e: React.PointerEvent, d: string) => void;
  /** Keyboard activation (pointer taps arrive through the drag hook). */
  onToggle: (d: string) => void;
}

export function RoomGuestPicker({ companions, visiting, onPointerDown, onToggle }: RoomGuestPickerProps) {
  const intl = useIntl();
  if (!companions.length) return null;

  return (
    <section className="w-full pt-1 pb-2 border-b border-border/50">
      <h3 className="text-sm font-semibold">
        <FormattedMessage id="blobbiRoom.guests.title" defaultMessage="Invite friends over" />
      </h3>
      <p className="text-xs text-muted-foreground">
        <FormattedMessage id="blobbiRoom.guests.hint" defaultMessage="Drag a Blobbi into the room, or tap to invite or send home." />
      </p>
      <div className="mt-2 flex gap-2 overflow-x-auto scrollbar-none pb-1">
        {companions.map((c) => {
          const here = visiting.has(c.d);
          return (
            <button
              key={c.d}
              type="button"
              data-room-drag=""
              onPointerDown={(e) => onPointerDown(e, c.d)}
              onClick={(e) => { if (e.detail === 0) onToggle(c.d); }}
              aria-pressed={here}
              aria-label={here
                ? intl.formatMessage({ id: 'blobbiRoom.guests.sendHome', defaultMessage: 'Send {name} home' }, { name: c.name })
                : intl.formatMessage({ id: 'blobbiRoom.guests.invite', defaultMessage: 'Invite {name} over' }, { name: c.name })}
              className={cn(
                'relative shrink-0 flex flex-col items-center gap-1 rounded-2xl p-1.5 w-20 touch-pan-x cursor-grab active:cursor-grabbing',
                'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring',
              )}
            >
              <div className={cn(
                'size-14 rounded-full pointer-events-none transition-shadow',
                here && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
              )}>
                <BlobbiStageVisual companion={c} size="sm" className="size-full!" />
              </div>
              <span className="w-full truncate text-center text-[11px] font-medium">{c.stage === 'egg' ? <FormattedMessage id="blobbiRoom.guests.egg" defaultMessage="Egg" /> : c.name}</span>
              {here && (
                <span className="absolute top-0.5 right-2 size-4 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                  <Check className="size-3" strokeWidth={3} />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}

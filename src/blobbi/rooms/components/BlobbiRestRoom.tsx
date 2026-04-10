// src/blobbi/rooms/components/BlobbiRestRoom.tsx

/**
 * BlobbiRestRoom — The bedroom / rest room.
 *
 * Bottom bar: Sleep/Wake button centered.
 */

import { Moon, Sun, Loader2 } from 'lucide-react';

import type { BlobbiRoomContext, RoomPoopState } from '../lib/room-types';
import { ROOM_BOTTOM_BAR_CLASS } from '../lib/room-layout';
import { BlobbiRoomHero } from './BlobbiRoomHero';
import { RoomActionButton } from './RoomActionButton';

interface BlobbiRestRoomProps {
  ctx: BlobbiRoomContext;
  poopState: RoomPoopState;
}

export function BlobbiRestRoom({ ctx }: BlobbiRestRoomProps) {
  const {
    isEgg,
    isSleeping,
    onRest,
    actionInProgress,
    isPublishing,
    isUsingItem,
    isActiveFloatingCompanion,
  } = ctx;

  const isDisabled = isPublishing || actionInProgress !== null || isUsingItem;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <BlobbiRoomHero ctx={ctx} className="flex-1 min-h-0" />

      {!isActiveFloatingCompanion && (
        <div className={ROOM_BOTTOM_BAR_CLASS}>
          <div className="flex items-center justify-center">
            {!isEgg && (
              <RoomActionButton
                icon={
                  actionInProgress === 'rest'
                    ? <Loader2 className="size-7 sm:size-9 animate-spin" />
                    : isSleeping
                      ? <Sun className="size-7 sm:size-9" />
                      : <Moon className="size-7 sm:size-9" />
                }
                label={isSleeping ? 'Wake up' : 'Sleep'}
                color={isSleeping ? 'text-amber-500' : 'text-violet-500'}
                glowHex={isSleeping ? '#f59e0b' : '#8b5cf6'}
                onClick={onRest}
                disabled={isDisabled}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

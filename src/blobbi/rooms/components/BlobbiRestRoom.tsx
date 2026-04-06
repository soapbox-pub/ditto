// src/blobbi/rooms/components/BlobbiRestRoom.tsx

/**
 * BlobbiRestRoom — The bedroom / rest room.
 *
 * Dedicated to sleep / wake / resting.
 * Layout:
 * - BlobbiRoomHero (Blobbi visual + stats)
 * - Bottom right: sleep / wake toggle (unified RoomActionButton style)
 * - Bottom center: minimal for now
 * - Bottom left: empty for now
 */

import { Moon, Sun, Loader2 } from 'lucide-react';

import type { BlobbiRoomContext } from '../lib/room-types';
import { BlobbiRoomHero } from './BlobbiRoomHero';
import { RoomActionButton } from './RoomActionButton';

interface BlobbiRestRoomProps {
  ctx: BlobbiRoomContext;
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
      {/* ── Hero ── */}
      <BlobbiRoomHero ctx={ctx} className="flex-1 min-h-0" />

      {/* ── Bottom Action Bar ── */}
      {!isActiveFloatingCompanion && (
        <div className="relative z-10 px-4 sm:px-8 pb-6 pt-2">
          <div className="flex items-start justify-between">
            {/* Bottom left — empty for now */}
            <div className="w-24 shrink-0" />

            {/* Center — minimal for now */}
            <div className="flex-1" />

            {/* Bottom right — Sleep / Wake */}
            {!isEgg && (
              <RoomActionButton
                icon={
                  actionInProgress === 'rest'
                    ? <Loader2 className="size-9 sm:size-10 animate-spin" />
                    : isSleeping
                      ? <Sun className="size-9 sm:size-10" />
                      : <Moon className="size-9 sm:size-10" />
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

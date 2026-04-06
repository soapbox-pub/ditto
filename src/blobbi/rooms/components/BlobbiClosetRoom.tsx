// src/blobbi/rooms/components/BlobbiClosetRoom.tsx

/**
 * BlobbiClosetRoom — Placeholder room for wardrobe / accessories.
 *
 * Uses the same bottom bar structure as other rooms for visual consistency,
 * with a centered placeholder message.
 */

import { Shirt } from 'lucide-react';

import type { BlobbiRoomContext, RoomPoopState } from '../lib/room-types';
import { ROOM_BOTTOM_BAR_CLASS } from '../lib/room-layout';
import { BlobbiRoomHero } from './BlobbiRoomHero';

interface BlobbiClosetRoomProps {
  ctx: BlobbiRoomContext;
  poopState: RoomPoopState;
}

export function BlobbiClosetRoom({ ctx }: BlobbiClosetRoomProps) {
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <BlobbiRoomHero ctx={ctx} className="flex-1 min-h-0" />

      {/* Bottom bar — same structure as other rooms */}
      <div className={ROOM_BOTTOM_BAR_CLASS}>
        <div className="flex items-center justify-center gap-2 py-1">
          <Shirt className="size-5 text-muted-foreground/30" />
          <p className="text-xs text-muted-foreground/40 font-medium">
            Closet coming soon
          </p>
        </div>
      </div>
    </div>
  );
}

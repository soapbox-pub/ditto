// src/blobbi/rooms/components/BlobbiClosetRoom.tsx

/**
 * BlobbiClosetRoom — Placeholder room for wardrobe / accessories.
 *
 * Not implemented yet — shows a clean empty state.
 */

import { Shirt } from 'lucide-react';

import type { BlobbiRoomContext } from '../lib/room-types';
import { ROOM_BOTTOM_BAR_CLASS } from '../lib/room-layout';
import { BlobbiRoomHero } from './BlobbiRoomHero';

interface BlobbiClosetRoomProps {
  ctx: BlobbiRoomContext;
}

export function BlobbiClosetRoom({ ctx }: BlobbiClosetRoomProps) {
  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* ── Hero ── */}
      <BlobbiRoomHero ctx={ctx} className="flex-1 min-h-0" />

      {/* ── Bottom Placeholder ── */}
      <div className={ROOM_BOTTOM_BAR_CLASS}>
        <div className="flex flex-col items-center gap-2 text-center py-4">
          <div className="size-12 rounded-full bg-muted/30 flex items-center justify-center">
            <Shirt className="size-6 text-muted-foreground/40" />
          </div>
          <p className="text-sm text-muted-foreground/50 font-medium">
            Closet coming soon
          </p>
        </div>
      </div>
    </div>
  );
}

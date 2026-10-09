/**
 * /blobbi/dev/room — development only (the route exists only in `vite dev`).
 *
 * The real room (BlobbiRoomShell, its 3D scene and the facing pipeline) with
 * a V3 Blobbi in it and nothing else: buttons walk the Blobbi toward the
 * viewer, away, left and right through the shell's own `approach`, and the
 * facing the shell reports is shown and handed to the stage exactly as the
 * Blobbi page does. Nothing is published; no login, no relay.
 */

import { useCallback, useRef, useState } from 'react';
import type { NostrEvent } from '@nostrify/nostrify';
import { KIND_BLOBBI_STATE, buildEggTags, parseBlobbiEvent, updateBlobbiTags, type BlobbiCompanion } from '@blobbi-kit/core';
import type { BlobbiFacing } from '@blobbi-kit/renderer';

import { BlobbiRoomShell, type RoomControl } from '@/blobbi/rooms/components/BlobbiRoomShell';
import { BlobbiRoomStage } from '@/blobbi/rooms/components/BlobbiRoomStage';
import { DEFAULT_ROOM_LAYOUTS } from '@/blobbi/rooms/lib/room-layout-defaults';
import { DEFAULT_ROOM_FURNITURE } from '@/blobbi/rooms/lib/room-furniture-defaults';
import { MAIN_BLOBBI, ROOM_GRID } from '@/blobbi/rooms/lib/room-geometry';

const PUBKEY = 'd17c0de0'.repeat(8);
const CREATED_AT = 1_757_000_000;
const FULL_STATS = { hunger: 100, happiness: 100, health: 100, hygiene: 100, energy: 100 };

/** A V3 adult is its address: the kit's own creation. */
function v3Adult(): BlobbiCompanion {
  const tags = updateBlobbiTags(buildEggTags(PUBKEY, '00000000a7', CREATED_AT, 'Umber', { visualGeneration: 'v3' }), { stage: 'adult', state: 'active' });
  const event: NostrEvent = { id: '0'.repeat(64), pubkey: PUBKEY, created_at: CREATED_AT, kind: KIND_BLOBBI_STATE, tags, content: '', sig: '0'.repeat(128) };
  return parseBlobbiEvent(event)!;
}

type Direction = 'toward' | 'away' | 'left' | 'right';
/**
 * Where each walk is aimed, in floor tiles. The camera sits at the open
 * (+x, +z) corner, so toward the viewer is the +x+z corner, away the -x-z
 * corner, screen left -x+z and screen right +x-z.
 */
const EDGE = ROOM_GRID - 1.5;
const AIM: Record<Direction, { x: number; z: number }> = {
  toward: { x: EDGE, z: EDGE },
  away: { x: 1.5, z: 1.5 },
  left: { x: 1.5, z: EDGE },
  right: { x: EDGE, z: 1.5 },
};

export function BlobbiRoomDevPage() {
  const [companion] = useState(v3Adult);
  const [facing, setFacing] = useState<BlobbiFacing>('front');
  const [walking, setWalking] = useState<Direction | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const controlRef = useRef<RoomControl | null>(null);
  const roomRef = useRef<HTMLDivElement>(null);

  const onActorFacingChange = useCallback((id: string, next: BlobbiFacing) => {
    if (id !== MAIN_BLOBBI) return;
    setFacing(next);
    setLog((prev) => [...prev.slice(-19), next]);
  }, []);

  /** Walk to a corner of the floor, through the shell's own approach (the nearest free tile to it). */
  const walk = useCallback((direction: Direction) => {
    const control = controlRef.current;
    if (!control) return;
    const spot = AIM[direction];
    setWalking(direction);
    control.approach(spot.x, spot.z, () => setWalking(null));
  }, []);

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-4" data-testid="blobbi-room-dev">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">Blobbi V3 in the room (dev)</h1>
        <p className="text-muted-foreground">The real room shell and scene. Walk the Blobbi; the facing the shell reports goes to the stage, as on the Blobbi page.</p>
        <div className="flex flex-wrap items-center gap-2">
          {(['toward', 'away', 'left', 'right'] as const).map((direction) => (
            <button key={direction} type="button" className="rounded border px-3 py-1" data-walk={direction} onClick={() => walk(direction)}>
              Walk {direction}
            </button>
          ))}
          <span className="text-sm" data-facing={facing} data-walking={walking ?? ''}>facing: {facing}{walking ? ` (walking ${walking})` : ''}</span>
        </div>
        <p className="text-xs text-muted-foreground" data-facing-log={log.join(',')}>facings reported: {log.join(' → ') || '(none yet)'}</p>
      </header>

      {/* The shell is a flex column that fills its parent: give it a sized flex parent, as the Blobbi page does. */}
      <div ref={roomRef} className="relative flex h-[680px] flex-col overflow-hidden rounded-xl border">
        <BlobbiRoomShell
          roomId="home"
          onChangeRoom={() => {}}
          isSleeping={false}
          blobbiStage={companion.stage}
          blobbiVisible
          poops={[]}
          roomLayout={DEFAULT_ROOM_LAYOUTS.home}
          furniturePlacements={DEFAULT_ROOM_FURNITURE.home}
          controlRef={controlRef}
          onActorFacingChange={onActorFacingChange}
          stage={
            <BlobbiRoomStage
              companion={companion}
              currentStats={FULL_STATS}
              isSleeping={false}
              statusRecipe={undefined}
              statusRecipeLabel={undefined}
              effectiveEmotion="neutral"
              hasDevOverride={false}
              blobbiReaction="idle"
              facing={facing}
            />
          }
        >
          <div />
        </BlobbiRoomShell>
      </div>
    </main>
  );
}

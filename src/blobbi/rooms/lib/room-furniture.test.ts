import { describe, it, expect } from 'vitest';

import { serializeProfileContent } from '@blobbi-kit/core/missions';

import {
  parseRoomFurnitureContent,
  migrateV1Placement,
  rebaseRoomDraft,
  roomFurnitureUpdate,
  RoomFurnitureTooNewError,
  MAX_FURNITURE_PER_ROOM,
  ROOM_FURNITURE_KEY,
  type FurniturePlacement,
} from './room-furniture-schema';
import { isValidRoomId } from './room-config';
import { MAX_FURNITURE_ID_LENGTH } from './sno-furniture';
import {
  resolveFurniture,
  canPlaceInRoom,
  getAvailableFurnitureForRoom,
  getAvailableFurnitureByCategory,
  OFFICIAL_FURNITURE,
} from './furniture-registry';
import { getEffectiveRoomFurniture } from './room-furniture-effective';
import { DEFAULT_ROOM_FURNITURE } from './room-furniture-defaults';
import { ROOM_GRID, WALL_HEIGHT, snapCenter } from './room-geometry';
import { OFFICIAL_MODEL_IDS } from './room-scene/official-models';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Profile content with version 1 under the key older clients own. */
function makeContent(roomFurniture: unknown): string {
  return JSON.stringify({ room_furniture: roomFurniture });
}

function validPlacement(overrides?: Record<string, unknown>): Record<string, unknown> {
  return { id: 'official:plant-small', at: 'floor', x: 4, y: 4, ...overrides };
}

function v2(byRoom: Record<string, unknown>): string {
  return JSON.stringify({ [ROOM_FURNITURE_KEY]: { v: 2, by_room: byRoom } });
}

function v1(byRoom: Record<string, unknown>): string {
  return makeContent({ v: 1, by_room: byRoom });
}

function interactions(placements: FurniturePlacement[] | undefined) {
  return (placements ?? []).map((p) => resolveFurniture(p.id)?.interaction).filter(Boolean);
}

// ─── Parser ───────────────────────────────────────────────────────────────────

describe('parseRoomFurnitureContent', () => {
  it('returns undefined for empty, non-JSON, or missing content', () => {
    expect(parseRoomFurnitureContent(undefined)).toBeUndefined();
    expect(parseRoomFurnitureContent('')).toBeUndefined();
    expect(parseRoomFurnitureContent('not json')).toBeUndefined();
    expect(parseRoomFurnitureContent(JSON.stringify({ other: 1 }))).toBeUndefined();
  });

  it('returns undefined for unknown versions', () => {
    expect(parseRoomFurnitureContent(makeContent({ v: 3, by_room: {} }))).toBeUndefined();
    expect(parseRoomFurnitureContent(JSON.stringify({ [ROOM_FURNITURE_KEY]: { v: 1, by_room: {} } }))).toBeUndefined();
  });

  it('prefers room_furniture_v2 over room_furniture', () => {
    const content = JSON.stringify({
      [ROOM_FURNITURE_KEY]: { v: 2, by_room: { home: [validPlacement({ x: 2 })] } },
      room_furniture: { v: 1, by_room: { home: [{ id: 'official:plant-tall', x: 0.5, y: 0.8, layer: 'floor' }] } },
    });
    expect(parseRoomFurnitureContent(content)?.by_room.home).toEqual([validPlacement({ x: 2 })]);
  });

  it('falls back to room_furniture when room_furniture_v2 is malformed', () => {
    const content = JSON.stringify({
      [ROOM_FURNITURE_KEY]: 'nope',
      room_furniture: { v: 2, by_room: { home: [validPlacement()] } },
    });
    expect(parseRoomFurnitureContent(content)?.by_room.home).toEqual([validPlacement()]);
  });

  it('shows defaults rather than room_furniture when room_furniture_v2 is from a newer version', () => {
    const content = JSON.stringify({
      [ROOM_FURNITURE_KEY]: { v: 3, by_room: {} },
      room_furniture: { v: 2, by_room: { home: [validPlacement()] } },
    });
    expect(parseRoomFurnitureContent(content)).toBeUndefined();
  });

  it('parses a v2 placement with every field', () => {
    const parsed = parseRoomFurnitureContent(v2({
      home: [validPlacement({ rot: 3, scale: 1.5, content: { imageUrl: 'https://example.com/a.jpg' } })],
    }));
    expect(parsed?.by_room.home).toEqual([{
      id: 'official:plant-small', at: 'floor', x: 4, y: 4, rot: 3, scale: 1.5,
      content: { imageUrl: 'https://example.com/a.jpg' },
    }]);
  });

  it('parses wall placements and clamps them to the wall', () => {
    const parsed = parseRoomFurnitureContent(v2({
      home: [validPlacement({ id: 'official:clock-wall', at: 'left', x: 99, y: 99, rot: 1 })],
    }));
    const p = parsed?.by_room.home?.[0];
    expect(p).toMatchObject({ at: 'left', x: ROOM_GRID, y: WALL_HEIGHT });
    // Rotation only applies to floor items
    expect(p?.rot).toBeUndefined();
  });

  it('preserves an explicit empty array (user cleared the room)', () => {
    const parsed = parseRoomFurnitureContent(v2({ home: [] }));
    expect(parsed?.by_room.home).toEqual([]);
    expect(getEffectiveRoomFurniture('home', parsed)).toEqual([]);
  });

  it('drops invalid items and keeps valid ones', () => {
    const parsed = parseRoomFurnitureContent(v2({
      home: [
        validPlacement({ id: 'no-namespace' }),
        validPlacement({ at: 'ceiling' }),
        validPlacement({ x: Infinity }),
        validPlacement({ x: 'a' }),
        validPlacement(),
      ],
    }));
    expect(parsed?.by_room.home).toHaveLength(1);
  });

  it('accepts sno: IDs, up to a length', () => {
    const long = `sno:naddr1${'q'.repeat(MAX_FURNITURE_ID_LENGTH)}`;
    const parsed = parseRoomFurnitureContent(v2({ home: [validPlacement({ id: 'sno:naddr1abc' }), validPlacement({ id: long })] }));
    expect(parsed?.by_room.home?.map((p) => p.id)).toEqual(['sno:naddr1abc']);
  });

  it('clamps scale and ignores invalid rotation', () => {
    const parsed = parseRoomFurnitureContent(v2({
      home: [validPlacement({ scale: 9, rot: 5 }), validPlacement({ scale: 0.1, rot: 2.5 })],
    }));
    expect(parsed?.by_room.home?.[0]).toMatchObject({ scale: 2 });
    expect(parsed?.by_room.home?.[0].rot).toBeUndefined();
    expect(parsed?.by_room.home?.[1]).toMatchObject({ scale: 0.5 });
    expect(parsed?.by_room.home?.[1].rot).toBeUndefined();
  });

  it('rejects non-https image URLs', () => {
    const parsed = parseRoomFurnitureContent(v2({
      home: [validPlacement({ content: { imageUrl: 'javascript:alert(1)' } })],
    }));
    expect(parsed?.by_room.home?.[0].content).toBeUndefined();
  });

  it('skips invalid room IDs', () => {
    const parsed = parseRoomFurnitureContent(v2({ attic: [validPlacement()], constructor: [validPlacement()], home: [validPlacement()] }));
    expect(Object.keys(parsed?.by_room ?? {})).toEqual(['home']);
    expect(isValidRoomId('toString')).toBe(false);
  });

  it(`keeps the first ${MAX_FURNITURE_PER_ROOM} valid items per room`, () => {
    const items = [validPlacement({ id: 'bad' }), ...Array.from({ length: 25 }, (_, i) => validPlacement({ x: i % 8 }))];
    const parsed = parseRoomFurnitureContent(v2({ home: items }));
    expect(parsed?.by_room.home).toHaveLength(MAX_FURNITURE_PER_ROOM);
    expect(parsed?.by_room.home?.[0].x).toBe(0);
  });
});

// ─── v1 migration ─────────────────────────────────────────────────────────────

describe('v1 migration', () => {
  it('converts a v1 room to v2', () => {
    const parsed = parseRoomFurnitureContent(v1({
      home: [
        { id: 'official:shelf-wall', x: 0.27, y: 0.3, layer: 'back' },
        { id: 'official:plant-tall', x: 0.88, y: 0.72, layer: 'front', flip: true },
      ],
    }));
    expect(parsed?.v).toBe(2);
    const [shelf, plant, toybox] = parsed!.by_room.home!;
    expect(shelf.at).toBe('left');
    expect(shelf.y).toBeGreaterThan(0);
    expect(shelf.y).toBeLessThanOrEqual(WALL_HEIGHT);
    expect(plant.at).toBe('floor');
    expect(plant).not.toHaveProperty('flip');
    // Version 1 rooms get their room's piece
    expect(toybox).toMatchObject({ id: 'official:toybox', at: 'floor' });
    expect(parsed!.by_room.home).toHaveLength(3);
  });

  it('gives each room its piece only if it has none and has space', () => {
    const bed = { id: 'official:bed-round', x: 0.5, y: 0.8, layer: 'floor' };
    const full = Array.from({ length: MAX_FURNITURE_PER_ROOM }, () => ({ id: 'official:plant-small', x: 0.5, y: 0.8, layer: 'floor' }));
    const parsed = parseRoomFurnitureContent(v1({ rest: [bed], kitchen: full, care: [] }));
    expect(interactions(parsed?.by_room.rest)).toEqual(['bed']);
    expect(interactions(parsed?.by_room.kitchen)).toEqual([]);
    expect(interactions(parsed?.by_room.care)).toEqual(['bath']);
  });

  it('puts wall pieces on a wall whatever their layer', () => {
    expect(migrateV1Placement({ id: 'official:clock-wall', x: 0.2, y: 0.8, layer: 'floor' })?.at).toBe('left');
  });

  it('puts right-side wall items on the right wall', () => {
    expect(migrateV1Placement({ id: 'official:clock-wall', x: 0.8, y: 0.2, layer: 'back' })?.at).toBe('right');
  });

  it('keeps floor items inside the room', () => {
    for (const x of [0, 0.5, 1]) {
      for (const y of [0.6, 0.8, 1]) {
        const p = migrateV1Placement({ id: 'official:rug-round', x, y, layer: 'floor' })!;
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(ROOM_GRID);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(ROOM_GRID);
      }
    }
  });

  it('rejects v1 items without a valid layer', () => {
    expect(migrateV1Placement({ id: 'official:rug-round', x: 0.5, y: 0.5, layer: 'sky' })).toBeUndefined();
  });
});

// ─── Saving ───────────────────────────────────────────────────────────────────

describe('roomFurnitureUpdate', () => {
  const plant = { id: 'official:plant-small', at: 'floor', x: 2, y: 2 } as const;

  it('replaces only the saved room, keeping what this version does not understand', () => {
    const content = JSON.stringify({
      [ROOM_FURNITURE_KEY]: {
        v: 2,
        future: true,
        by_room: { attic: [validPlacement()], home: [validPlacement({ glow: 1 })], kitchen: [validPlacement({ x: 9, at: 'ceiling' })] },
      },
    });
    expect(roomFurnitureUpdate(content, 'rest', [plant])).toEqual({
      [ROOM_FURNITURE_KEY]: {
        v: 2,
        future: true,
        by_room: { attic: [validPlacement()], home: [validPlacement({ glow: 1 })], kitchen: [validPlacement({ x: 9, at: 'ceiling' })], rest: [plant] },
      },
    });
  });

  it('converts every version 1 room on the first save, and leaves room_furniture alone', () => {
    const legacy = { v: 1, by_room: { home: [{ id: 'official:plant-tall', x: 0.5, y: 0.8, layer: 'floor' }] } };
    const content = JSON.stringify({ room_furniture: legacy, missions: { daily: [] } });
    const saved = JSON.parse(serializeProfileContent(content, roomFurnitureUpdate(content, 'rest', [plant])));
    expect(saved.room_furniture).toEqual(legacy);
    expect(saved.missions).toEqual({ daily: [] });
    expect(saved[ROOM_FURNITURE_KEY].by_room.rest).toEqual([plant]);
    expect(saved[ROOM_FURNITURE_KEY].by_room.home).toEqual(parseRoomFurnitureContent(content)?.by_room.home);
  });

  it('refuses to overwrite rooms stored in a newer version', () => {
    const content = JSON.stringify({ [ROOM_FURNITURE_KEY]: { v: 3, by_room: { home: [] } } });
    expect(() => roomFurnitureUpdate(content, 'rest', [plant])).toThrow(RoomFurnitureTooNewError);
  });
});

describe('rebaseRoomDraft', () => {
  const at = (x: number): FurniturePlacement => ({ id: 'official:plant-small', at: 'floor', x, y: 1 });
  const [a, b, c, d] = [at(1), at(2), at(3), at(4)];

  it('keeps pieces added and drops pieces removed since the draft started', () => {
    expect(rebaseRoomDraft([a, b], [a, b, c], [b, d])).toEqual([d, b, c]);
  });

  it('keeps pieces added elsewhere over the draft’s own when the room overflows', () => {
    const draft = Array.from({ length: MAX_FURNITURE_PER_ROOM }, (_, i) => ({ ...at(i), y: 2 }));
    expect(rebaseRoomDraft([], draft, [d])).toEqual([d, ...draft.slice(0, MAX_FURNITURE_PER_ROOM - 1)]);
  });

  it('keeps a piece the draft moved even if it was removed elsewhere', () => {
    expect(rebaseRoomDraft([a], [at(5)], [])).toEqual([at(5)]);
  });

  it('is the draft when nothing changed elsewhere', () => {
    expect(rebaseRoomDraft([a, b], [b], [a, b])).toEqual([b]);
  });
});

// ─── Geometry ─────────────────────────────────────────────────────────────────

describe('snapCenter', () => {
  it('centers odd footprints on tiles and even footprints on tile edges', () => {
    expect(snapCenter(3.2, 1)).toBe(3.5);
    expect(snapCenter(3.2, 2)).toBe(3);
  });

  it('keeps the footprint inside the room', () => {
    expect(snapCenter(0, 3)).toBe(1.5);
    expect(snapCenter(ROOM_GRID, 2)).toBe(ROOM_GRID - 1);
  });
});

// ─── Registry ─────────────────────────────────────────────────────────────────

describe('furniture registry', () => {
  it('resolves official IDs and rejects unknown ones', () => {
    expect(resolveFurniture('official:plant-small')?.label.defaultMessage).toBe('Small Plant');
    expect(resolveFurniture('official:nope')).toBeUndefined();
    expect(resolveFurniture('custom:thing')).toBeUndefined();
    expect(resolveFurniture('nocolon')).toBeUndefined();
  });

  it('has unique IDs and a 3D model for every official item', () => {
    const ids = OFFICIAL_FURNITURE.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter((id) => !OFFICIAL_MODEL_IDS.includes(id))).toEqual([]);
  });

  it('only marks floor pieces as small or as surfaces', () => {
    for (const def of OFFICIAL_FURNITURE) {
      if (def.small || def.surface) expect(def.mount).toBe('floor');
    }
  });

  it('filters room-restricted items', () => {
    const bed = resolveFurniture('official:bed-single')!;
    expect(canPlaceInRoom(bed, 'rest')).toBe(true);
    expect(canPlaceInRoom(bed, 'kitchen')).toBe(false);
    expect(getAvailableFurnitureForRoom('kitchen').some((d) => d.id === 'official:fridge')).toBe(true);
    expect(getAvailableFurnitureForRoom('home').some((d) => d.id === 'official:fridge')).toBe(false);
  });

  it('groups the catalog by category in display order', () => {
    const groups = getAvailableFurnitureByCategory('home').map((g) => g.category);
    expect(groups).toEqual(['furniture', 'decor', 'plants', 'clocks', 'frames']);
  });
});

// ─── Defaults ─────────────────────────────────────────────────────────────────

describe('DEFAULT_ROOM_FURNITURE', () => {
  it('uses known items allowed in their room, inside the room', () => {
    for (const [room, placements] of Object.entries(DEFAULT_ROOM_FURNITURE)) {
      for (const p of placements ?? []) {
        const def = resolveFurniture(p.id);
        expect(def, p.id).toBeDefined();
        expect(canPlaceInRoom(def!, room as never), `${p.id} in ${room}`).toBe(true);
        expect(def!.mount === 'wall', p.id).toBe(p.at !== 'floor');
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(ROOM_GRID);
      }
    }
  });

  it('is used when nothing is saved', () => {
    expect(getEffectiveRoomFurniture('home', undefined)).toBe(DEFAULT_ROOM_FURNITURE.home);
  });
});

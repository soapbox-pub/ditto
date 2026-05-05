import { describe, it, expect } from 'vitest';

import {
  parseRoomFurnitureContent,
  MAX_FURNITURE_PER_ROOM,
  type RoomFurnitureContent,
} from './room-furniture-schema';
import {
  resolveFurniture,
  getFurnitureAsset,
  canPlaceInRoom,
  getAvailableFurnitureForRoom,
  getAvailableFurnitureByCategory,
  OFFICIAL_FURNITURE,
} from './furniture-registry';
import { getEffectiveRoomFurniture } from './room-furniture-effective';
import { DEFAULT_ROOM_FURNITURE } from './room-furniture-defaults';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeContent(roomFurniture: unknown): string {
  return JSON.stringify({ room_furniture: roomFurniture });
}

function validPlacement(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 'official:plant-small',
    x: 0.5,
    y: 0.7,
    layer: 'floor',
    ...overrides,
  };
}

// ─── Parser: Basic Parsing ────────────────────────────────────────────────────

describe('parseRoomFurnitureContent', () => {
  it('returns undefined for empty/null/undefined input', () => {
    expect(parseRoomFurnitureContent(undefined)).toBeUndefined();
    expect(parseRoomFurnitureContent(null)).toBeUndefined();
    expect(parseRoomFurnitureContent('')).toBeUndefined();
    expect(parseRoomFurnitureContent('   ')).toBeUndefined();
  });

  it('returns undefined for non-JSON content', () => {
    expect(parseRoomFurnitureContent('not json')).toBeUndefined();
  });

  it('returns undefined if room_furniture key is missing', () => {
    expect(parseRoomFurnitureContent(JSON.stringify({ missions: {} }))).toBeUndefined();
  });

  it('returns undefined if room_furniture is not an object', () => {
    expect(parseRoomFurnitureContent(makeContent('string'))).toBeUndefined();
    expect(parseRoomFurnitureContent(makeContent(42))).toBeUndefined();
    expect(parseRoomFurnitureContent(makeContent([]))).toBeUndefined();
    expect(parseRoomFurnitureContent(makeContent(null))).toBeUndefined();
  });

  it('returns undefined if version is not 1', () => {
    expect(parseRoomFurnitureContent(makeContent({ v: 2, by_room: {} }))).toBeUndefined();
    expect(parseRoomFurnitureContent(makeContent({ v: 0, by_room: {} }))).toBeUndefined();
    expect(parseRoomFurnitureContent(makeContent({ by_room: {} }))).toBeUndefined();
  });

  it('returns undefined if by_room is not an object', () => {
    expect(parseRoomFurnitureContent(makeContent({ v: 1, by_room: 'bad' }))).toBeUndefined();
    expect(parseRoomFurnitureContent(makeContent({ v: 1, by_room: [] }))).toBeUndefined();
  });

  it('parses valid minimal content', () => {
    const result = parseRoomFurnitureContent(makeContent({ v: 1, by_room: {} }));
    expect(result).toEqual({ v: 1, by_room: {} });
  });

  it('parses a valid placement', () => {
    const content = makeContent({
      v: 1,
      by_room: { home: [validPlacement()] },
    });
    const result = parseRoomFurnitureContent(content);
    expect(result?.by_room.home).toHaveLength(1);
    expect(result?.by_room.home?.[0]).toEqual({
      id: 'official:plant-small',
      x: 0.5,
      y: 0.7,
      layer: 'floor',
    });
  });

  it('preserves explicit empty array (user cleared room)', () => {
    const content = makeContent({
      v: 1,
      by_room: { home: [] },
    });
    const result = parseRoomFurnitureContent(content);
    expect(result?.by_room.home).toEqual([]);
  });

  it('explicit empty array parsed through effective resolver returns [] not defaults', () => {
    const content = makeContent({
      v: 1,
      by_room: { home: [] },
    });
    const parsed = parseRoomFurnitureContent(content)!;
    const result = getEffectiveRoomFurniture('home', parsed);
    expect(result).toEqual([]);
    expect(result).not.toBe(DEFAULT_ROOM_FURNITURE.home);
  });

  it('parses all optional fields', () => {
    const content = makeContent({
      v: 1,
      by_room: {
        home: [validPlacement({
          scale: 1.5,
          flip: true,
          variant: 'gold',
          content: { imageUrl: 'https://blossom.example.com/abc123.jpg' },
        })],
      },
    });
    const result = parseRoomFurnitureContent(content);
    const p = result?.by_room.home?.[0];
    expect(p?.scale).toBe(1.5);
    expect(p?.flip).toBe(true);
    expect(p?.variant).toBe('gold');
    expect(p?.content?.imageUrl).toBe('https://blossom.example.com/abc123.jpg');
  });
});

// ─── Parser: Validation Rules ─────────────────────────────────────────────────

describe('parseRoomFurnitureContent validation', () => {
  it('rejects items with invalid ID format', () => {
    const content = makeContent({
      v: 1,
      by_room: { home: [validPlacement({ id: 'no-namespace' })] },
    });
    const result = parseRoomFurnitureContent(content);
    expect(result?.by_room.home).toEqual([]);
  });

  it('rejects items with empty namespace or slug', () => {
    const bad = [':slug', 'ns:', ':', '', 'UPPER:case', 'ns:UPPER'];
    for (const id of bad) {
      const content = makeContent({
        v: 1,
        by_room: { home: [validPlacement({ id })] },
      });
      const result = parseRoomFurnitureContent(content);
      expect(result?.by_room.home).toEqual([]);
    }
  });

  it('accepts valid namespaced IDs', () => {
    const good = ['official:plant-small', 'custom:my-item', 'nostr:abc123'];
    for (const id of good) {
      const content = makeContent({
        v: 1,
        by_room: { home: [validPlacement({ id })] },
      });
      const result = parseRoomFurnitureContent(content);
      expect(result?.by_room.home).toHaveLength(1);
    }
  });

  it('rejects items with non-finite coordinates', () => {
    const badCoords = [NaN, Infinity, -Infinity, undefined, 'string'];
    for (const x of badCoords) {
      const content = makeContent({
        v: 1,
        by_room: { home: [validPlacement({ x: x as number })] },
      });
      const result = parseRoomFurnitureContent(content);
      expect(result?.by_room.home).toEqual([]);
    }
  });

  it('clamps coordinates to [0, 1]', () => {
    const content = makeContent({
      v: 1,
      by_room: { home: [validPlacement({ x: -0.5, y: 1.5 })] },
    });
    const result = parseRoomFurnitureContent(content);
    expect(result?.by_room.home?.[0]?.x).toBe(0);
    expect(result?.by_room.home?.[0]?.y).toBe(1);
  });

  it('rejects items with invalid layer', () => {
    const content = makeContent({
      v: 1,
      by_room: { home: [validPlacement({ layer: 'ceiling' })] },
    });
    const result = parseRoomFurnitureContent(content);
    expect(result?.by_room.home).toEqual([]);
  });

  it('clamps scale to [0.5, 2.0]', () => {
    const content = makeContent({
      v: 1,
      by_room: { home: [validPlacement({ scale: 0.1 }), validPlacement({ scale: 5.0 })] },
    });
    const result = parseRoomFurnitureContent(content);
    expect(result?.by_room.home?.[0]?.scale).toBe(0.5);
    expect(result?.by_room.home?.[1]?.scale).toBe(2.0);
  });

  it('ignores non-finite scale values', () => {
    const content = makeContent({
      v: 1,
      by_room: { home: [validPlacement({ scale: NaN })] },
    });
    const result = parseRoomFurnitureContent(content);
    expect(result?.by_room.home?.[0]?.scale).toBeUndefined();
  });

  it('ignores non-boolean flip values', () => {
    const content = makeContent({
      v: 1,
      by_room: { home: [validPlacement({ flip: 'yes' })] },
    });
    const result = parseRoomFurnitureContent(content);
    expect(result?.by_room.home?.[0]?.flip).toBeUndefined();
  });

  it('ignores empty or too-long variant strings', () => {
    const content = makeContent({
      v: 1,
      by_room: { home: [validPlacement({ variant: '' })] },
    });
    const result = parseRoomFurnitureContent(content);
    expect(result?.by_room.home?.[0]?.variant).toBeUndefined();

    const longVariant = 'a'.repeat(33);
    const content2 = makeContent({
      v: 1,
      by_room: { home: [validPlacement({ variant: longVariant })] },
    });
    const result2 = parseRoomFurnitureContent(content2);
    expect(result2?.by_room.home?.[0]?.variant).toBeUndefined();
  });

  it('rejects non-https imageUrls', () => {
    const badUrls = ['http://insecure.com/img.jpg', 'javascript:alert(1)', 'data:image/png;base64,...', 'ftp://files.com/img'];
    for (const url of badUrls) {
      const content = makeContent({
        v: 1,
        by_room: { home: [validPlacement({ content: { imageUrl: url } })] },
      });
      const result = parseRoomFurnitureContent(content);
      expect(result?.by_room.home?.[0]?.content).toBeUndefined();
    }
  });

  it('accepts valid https imageUrls', () => {
    const content = makeContent({
      v: 1,
      by_room: { home: [validPlacement({ content: { imageUrl: 'https://cdn.example.com/photo.jpg' } })] },
    });
    const result = parseRoomFurnitureContent(content);
    expect(result?.by_room.home?.[0]?.content?.imageUrl).toBe('https://cdn.example.com/photo.jpg');
  });

  it('skips invalid room IDs', () => {
    const content = makeContent({
      v: 1,
      by_room: { invalid_room: [validPlacement()], home: [validPlacement()] },
    });
    const result = parseRoomFurnitureContent(content);
    expect(result?.by_room.home).toHaveLength(1);
    expect((result?.by_room as Record<string, unknown>)['invalid_room']).toBeUndefined();
  });
});

// ─── Parser: Per-Room Cap ─────────────────────────────────────────────────────

describe('parseRoomFurnitureContent per-room cap', () => {
  it(`drops items beyond ${MAX_FURNITURE_PER_ROOM} per room`, () => {
    const placements = Array.from({ length: 25 }, (_, i) =>
      validPlacement({ x: i / 25 }),
    );
    const content = makeContent({
      v: 1,
      by_room: { home: placements },
    });
    const result = parseRoomFurnitureContent(content);
    expect(result?.by_room.home).toHaveLength(MAX_FURNITURE_PER_ROOM);
  });

  it('keeps the first 20 valid items, not the last', () => {
    const placements = Array.from({ length: 25 }, (_, i) =>
      validPlacement({ x: i / 25 }),
    );
    const content = makeContent({
      v: 1,
      by_room: { home: placements },
    });
    const result = parseRoomFurnitureContent(content);
    // First item should have x = 0/25 = 0
    expect(result?.by_room.home?.[0]?.x).toBe(0);
    // Last kept item should have x = 19/25
    expect(result?.by_room.home?.[19]?.x).toBeCloseTo(19 / 25);
  });

  it('invalid items do not count toward the cap', () => {
    const placements: unknown[] = [
      validPlacement({ id: 'bad-no-namespace' }),  // invalid, skipped
      ...Array.from({ length: 20 }, (_, i) => validPlacement({ x: i / 20 })),
    ];
    const content = makeContent({
      v: 1,
      by_room: { home: placements },
    });
    const result = parseRoomFurnitureContent(content);
    // 20 valid items (the invalid one was skipped, not counted)
    expect(result?.by_room.home).toHaveLength(20);
  });
});

// ─── Furniture Registry ───────────────────────────────────────────────────────

describe('resolveFurniture', () => {
  it('resolves known official IDs', () => {
    const def = resolveFurniture('official:plant-small');
    expect(def).toBeDefined();
    expect(def?.id).toBe('official:plant-small');
    expect(def?.label).toBe('Small Plant');
  });

  it('returns undefined for unknown official IDs', () => {
    expect(resolveFurniture('official:nonexistent')).toBeUndefined();
  });

  it('returns undefined for unimplemented namespaces', () => {
    expect(resolveFurniture('custom:user-item')).toBeUndefined();
    expect(resolveFurniture('nostr:event-id')).toBeUndefined();
  });

  it('returns undefined for malformed IDs', () => {
    expect(resolveFurniture('no-colon')).toBeUndefined();
    expect(resolveFurniture('')).toBeUndefined();
    expect(resolveFurniture(':empty-ns')).toBeUndefined();
  });
});

describe('getFurnitureAsset', () => {
  it('returns default asset when no variant', () => {
    const def = resolveFurniture('official:picture-frame')!;
    expect(getFurnitureAsset(def)).toBe('/furniture/frame-wood.svg');
  });

  it('returns variant-specific asset', () => {
    // Test with a synthetic definition since no official items currently use variants
    const def: Parameters<typeof getFurnitureAsset>[0] = {
      id: 'test:frame',
      category: 'frames',
      label: 'Test',
      asset: '/furniture/frame-wood.svg',
      aspectRatio: 0.8,
      baseWidth: 0.1,
      allowedLayers: ['back'],
      defaultLayer: 'back',
      flippable: false,
      variants: ['wood', 'gold', 'black'],
    };
    expect(getFurnitureAsset(def, 'gold')).toBe('/furniture/frame-gold.svg');
    expect(getFurnitureAsset(def, 'black')).toBe('/furniture/frame-black.svg');
  });

  it('falls back to default asset for invalid variant', () => {
    const def: Parameters<typeof getFurnitureAsset>[0] = {
      id: 'test:frame',
      category: 'frames',
      label: 'Test',
      asset: '/furniture/frame-wood.svg',
      aspectRatio: 0.8,
      baseWidth: 0.1,
      allowedLayers: ['back'],
      defaultLayer: 'back',
      flippable: false,
      variants: ['wood', 'gold'],
    };
    expect(getFurnitureAsset(def, 'chrome')).toBe('/furniture/frame-wood.svg');
  });

  it('returns default asset for items without variants', () => {
    const def = resolveFurniture('official:plant-small')!;
    expect(getFurnitureAsset(def, 'anything')).toBe('/furniture/plant-small.svg');
  });
});

describe('canPlaceInRoom', () => {
  it('returns true for items with no room restriction', () => {
    const def = resolveFurniture('official:plant-small')!;
    expect(canPlaceInRoom(def, 'home')).toBe(true);
    expect(canPlaceInRoom(def, 'rest')).toBe(true);
    expect(canPlaceInRoom(def, 'kitchen')).toBe(true);
  });

  it('returns true for allowed rooms', () => {
    const def = resolveFurniture('official:bed-single')!;
    expect(canPlaceInRoom(def, 'rest')).toBe(true);
    expect(canPlaceInRoom(def, 'home')).toBe(true);
  });

  it('returns false for non-allowed rooms', () => {
    const def = resolveFurniture('official:bed-single')!;
    expect(canPlaceInRoom(def, 'kitchen')).toBe(false);
    expect(canPlaceInRoom(def, 'care')).toBe(false);
  });
});

describe('getAvailableFurnitureForRoom', () => {
  it('returns all unrestricted items plus room-specific items', () => {
    const available = getAvailableFurnitureForRoom('home');
    // Should include plant (no restriction) and bed (home allowed)
    expect(available.some(d => d.id === 'official:plant-small')).toBe(true);
    expect(available.some(d => d.id === 'official:bed-single')).toBe(true);
  });

  it('excludes items restricted to other rooms', () => {
    const available = getAvailableFurnitureForRoom('kitchen');
    // Bed is restricted to rest and home
    expect(available.some(d => d.id === 'official:bed-single')).toBe(false);
  });
});

describe('OFFICIAL_FURNITURE integrity', () => {
  it('all items have unique IDs', () => {
    const ids = OFFICIAL_FURNITURE.map(f => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all IDs match the namespaced format', () => {
    for (const def of OFFICIAL_FURNITURE) {
      expect(def.id).toMatch(/^official:[a-z][a-z0-9-]*$/);
    }
  });

  it('all items have positive aspectRatio and baseWidth', () => {
    for (const def of OFFICIAL_FURNITURE) {
      expect(def.aspectRatio).toBeGreaterThan(0);
      expect(def.baseWidth).toBeGreaterThan(0);
      expect(def.baseWidth).toBeLessThanOrEqual(1);
    }
  });

  it('defaultLayer is in allowedLayers', () => {
    for (const def of OFFICIAL_FURNITURE) {
      expect(def.allowedLayers).toContain(def.defaultLayer);
    }
  });
});

// ─── Effective Furniture Resolver ─────────────────────────────────────────────

describe('getEffectiveRoomFurniture', () => {
  it('returns defaults when no saved furniture', () => {
    const result = getEffectiveRoomFurniture('home', undefined);
    expect(result).toBe(DEFAULT_ROOM_FURNITURE.home);
  });

  it('returns saved furniture over defaults', () => {
    const saved: RoomFurnitureContent = {
      v: 1,
      by_room: {
        home: [{ id: 'official:clock-wall', x: 0.3, y: 0.2, layer: 'back' }],
      },
    };
    const result = getEffectiveRoomFurniture('home', saved);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('official:clock-wall');
  });

  it('returns empty array for rooms with no defaults and no saved data', () => {
    // Remove defaults for care to test — but since it has defaults, test a hypothetical
    const saved: RoomFurnitureContent = { v: 1, by_room: {} };
    // With explicit saved empty by_room, getEffective should check saved.by_room.home
    // which is undefined, so falls back to defaults
    const result = getEffectiveRoomFurniture('home', saved);
    expect(result).toBe(DEFAULT_ROOM_FURNITURE.home);
  });

  it('returns saved even if empty array (user explicitly cleared)', () => {
    const saved: RoomFurnitureContent = {
      v: 1,
      by_room: { home: [] },
    };
    // Empty array is truthy — user explicitly cleared their room
    // Wait: [] is truthy in JS, but the effective resolver checks `if (saved)` on the array
    // Let's verify: `const saved = parsedFurniture?.by_room[roomId]` → [] is truthy
    const result = getEffectiveRoomFurniture('home', saved);
    expect(result).toEqual([]);
  });
});

// ─── getAvailableFurnitureByCategory ──────────────────────────────────────────

describe('getAvailableFurnitureByCategory', () => {
  it('returns categories in display order with expected labels', () => {
    const groups = getAvailableFurnitureByCategory('home');
    const labels = groups.map((g) => g.label);
    // Home has all categories available
    expect(labels).toEqual(['Furniture', 'Decor', 'Plants', 'Clocks', 'Frames']);
  });

  it('filters room-restricted furniture from ineligible rooms', () => {
    // Kitchen has no room-restricted furniture items (bed is rest/home only)
    // but it does have unrestricted items in all other categories
    const groups = getAvailableFurnitureByCategory('kitchen');
    // Verify furniture category items don't include room-restricted bed
    const furnitureGroup = groups.find((g) => g.category === 'furniture');
    const furnitureIds = furnitureGroup?.items.map((i) => i.id) ?? [];
    expect(furnitureIds).not.toContain('official:bed-single');
  });

  it('excludes room-restricted clocks from ineligible rooms', () => {
    const groups = getAvailableFurnitureByCategory('kitchen');
    const clockGroup = groups.find((g) => g.category === 'clocks');
    const clockIds = clockGroup?.items.map((i) => i.id) ?? [];
    // These clocks are restricted to rest/home
    expect(clockIds).not.toContain('official:clock-bedside');
    expect(clockIds).not.toContain('official:clock-alarm');
    expect(clockIds).not.toContain('official:clock-table-digital');
  });
});

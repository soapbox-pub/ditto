import { describe, expect, it } from 'vitest';
import { getTileFeedKinds } from './feedKinds';
import type { TileKindConflictMode } from '@/contexts/AppContext';
import type { TileDefinition } from './definition';

const nativeKinds = new Set<number>([1, 1111, 6, 7, 9735, 30023]);

function makeTile(overrides: Partial<TileDefinition> = {}): TileDefinition {
  return {
    id: 'a'.repeat(64),
    pubkey: 'b'.repeat(64),
    createdAt: 1_700_000_000,
    identifier: 'alice@example.com:widget',
    name: 'Widget',
    version: '1.0.0',
    language: 'lua',
    script: 'function render() return ui.Text("hello") end',
    perms: ['fetch'],
    ...overrides,
  };
}

function tileWithRender(kinds: number[], inFeed: boolean): TileDefinition {
  return makeTile({
    render: {
      filter: { kinds },
      inFeed,
    },
  });
}

describe('getTileFeedKinds', () => {
  // ── Basic collection ────────────────────────────────────────────────────
  it('returns empty for no definitions', () => {
    expect(getTileFeedKinds([], nativeKinds, 'native-only')).toEqual([]);
  });

  it('returns empty when no tile has render entries', () => {
    const defs = [makeTile(), makeTile()];
    expect(getTileFeedKinds(defs, nativeKinds, 'native-only')).toEqual([]);
  });

  it('returns empty when render entries are present but inFeed is false', () => {
    const defs = [tileWithRender([42, 99], false)];
    expect(getTileFeedKinds(defs, nativeKinds, 'native-only')).toEqual([]);
  });

  it('returns kinds from a single render entry with inFeed=true', () => {
    const defs = [tileWithRender([42, 99], true)];
    expect(getTileFeedKinds(defs, nativeKinds, 'native-only')).toEqual([42, 99]);
  });

  it('returns empty when render.filter.kinds is empty', () => {
    const defs = [tileWithRender([], true)];
    expect(getTileFeedKinds(defs, nativeKinds, 'native-only')).toEqual([]);
  });

  it('returns empty when render.filter.kinds is undefined', () => {
    const defs = [
      makeTile({
        render: {
          filter: { authors: ['a'.repeat(64)] },
          inFeed: true,
        },
      }),
    ];
    expect(getTileFeedKinds(defs, nativeKinds, 'native-only')).toEqual([]);
  });

  // ── Deduplication ───────────────────────────────────────────────────────
  it('deduplicates kinds across multiple tiles', () => {
    const defs = [
      tileWithRender([42, 99], true),
      tileWithRender([99, 123], true),
    ];
    expect(getTileFeedKinds(defs, nativeKinds, 'native-only')).toEqual([42, 99, 123]);
  });

  it('deduplicates kinds within a single tile', () => {
    const defs = [tileWithRender([42, 42, 42], true)];
    expect(getTileFeedKinds(defs, nativeKinds, 'native-only')).toEqual([42]);
  });

  // ── Conflict modes ──────────────────────────────────────────────────────
  function testMode(mode: TileKindConflictMode, expected: number[]) {
    it(`mode=${mode}: returns ${JSON.stringify(expected)} for tiles claiming [42, 1, 9735]`, () => {
      // Tile claims 42 (unknown), 1 (posts, native), 9735 (zaps, native)
      const defs = [tileWithRender([42, 1, 9735], true)];
      expect(getTileFeedKinds(defs, nativeKinds, mode)).toEqual(expected);
    });
  }

  testMode('native-only', [42]); // 1 and 9735 are native, dropped
  testMode('show-both', [42, 1, 9735]); // all kept
  testMode('generic-overrides', [42, 1, 9735]); // all kept

  // ── Mixed tiles ─────────────────────────────────────────────────────────
  it('only collects from tiles with inFeed=true, ignoring inFeed=false tiles', () => {
    const defs = [
      tileWithRender([42], true),  // included
      tileWithRender([99], false), // skipped
      makeTile(),                   // no render
      tileWithRender([123], true), // included
    ];
    expect(getTileFeedKinds(defs, nativeKinds, 'native-only')).toEqual([42, 123]);
  });

  // ── Empty native set ───────────────────────────────────────────────────
  it('returns all claimed kinds when nativeKinds is empty (native-only)', () => {
    const defs = [tileWithRender([42, 1, 9735], true)];
    expect(getTileFeedKinds(defs, new Set(), 'native-only')).toEqual([42, 1, 9735]);
  });

  // ── All native kinds conflict ──────────────────────────────────────────
  it('returns empty when all claimed kinds are native (native-only)', () => {
    const defs = [tileWithRender([1, 6, 7], true)];
    expect(getTileFeedKinds(defs, nativeKinds, 'native-only')).toEqual([]);
  });
});

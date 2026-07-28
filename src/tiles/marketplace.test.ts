import type { NostrEvent } from '@nostrify/nostrify';
import { finalizeEvent, getPublicKey } from 'nostr-tools';
import { describe, expect, it } from 'vitest';
import {
  getNewestTileDefinitions,
  searchMarketplaceTiles,
  sortMarketplaceTiles,
} from './marketplace';
import type { TileDefinition } from './definition';

const ALICE_PRIVATE_KEY = new Uint8Array(32).fill(1);
const BOB_PRIVATE_KEY = new Uint8Array(32).fill(2);
const ALICE = getPublicKey(ALICE_PRIVATE_KEY);
const BOB = getPublicKey(BOB_PRIVATE_KEY);

function tileEvent(identifier: string, pubkey: string, created_at: number, name: string, summary: string, tags: string[][] = []): NostrEvent {
  return finalizeEvent({
    created_at,
    kind: 30207,
    content: 'function render() return ui.Text("tile") end',
    tags: [
      ['d', identifier],
      ['name', name],
      ['v', `${created_at}`],
      ['s', '3'],
      ['language', 'lua'],
      ['t', 'nostr-canvas-tile'],
      ['summary', summary],
      ['perm', 'fetch'],
      ...tags,
    ],
  }, pubkey === BOB ? BOB_PRIVATE_KEY : ALICE_PRIVATE_KEY);
}

function makeTile(overrides: Partial<TileDefinition> = {}): TileDefinition {
  return {
    id: 'c'.repeat(64),
    pubkey: ALICE,
    createdAt: 20,
    identifier: 'alice@example.com:widget',
    name: 'Widget',
    version: '1',
    language: 'lua',
    script: 'return ui.Text("tile")',
    perms: [],
    ...overrides,
  };
}

describe('getNewestTileDefinitions', () => {
  it('keeps the newest definition per identifier (by createdAt)', () => {
    const oldWeather = tileEvent('alice@example.com:weather', ALICE, 10, 'Old Weather', 'Forecasts');
    const newWeather = tileEvent('alice@example.com:weather', ALICE, 20, 'Weather', 'Forecasts');

    const tiles = getNewestTileDefinitions([oldWeather, newWeather]);
    expect(tiles).toHaveLength(1);
    expect(tiles[0]).toMatchObject({ identifier: 'alice@example.com:weather', name: 'Weather', createdAt: 20 });
  });

  it('returns tiles sorted by createdAt descending', () => {
    const weather = tileEvent('alice@example.com:weather', ALICE, 10, 'Weather', 'F');
    const clock = tileEvent('alice@example.com:clock', ALICE, 30, 'Clock', 'T');
    const tiles = getNewestTileDefinitions([weather, clock]);
    expect(tiles).toHaveLength(2);
    expect(tiles[0].identifier).toBe('alice@example.com:clock');
    expect(tiles[1].identifier).toBe('alice@example.com:weather');
  });
});

describe('searchMarketplaceTiles', () => {
  it('searches name, summary, and NIP-05 namespace deterministically', () => {
    const tiles = getNewestTileDefinitions([
      tileEvent('alice@example.com:weather', ALICE, 20, 'Weather', 'Forecasts'),
      tileEvent('alice@example.com:clock', ALICE, 10, 'Clock', 'The time'),
    ]);

    expect(searchMarketplaceTiles(tiles, 'forecast').map((t) => t.identifier)).toEqual(['alice@example.com:weather']);
    expect(searchMarketplaceTiles(tiles, 'alice@example').map((t) => t.identifier)).toEqual([
      'alice@example.com:weather',
      'alice@example.com:clock',
    ]);
  });

  it('returns all tiles for an empty query', () => {
    const tiles = getNewestTileDefinitions([
      tileEvent('alice@example.com:weather', ALICE, 20, 'Weather', 'F'),
      tileEvent('alice@example.com:clock', ALICE, 10, 'Clock', 'T'),
    ]);
    expect(searchMarketplaceTiles(tiles, '')).toHaveLength(2);
  });
});

describe('sortMarketplaceTiles', () => {
  const tiles: TileDefinition[] = [
    makeTile({ id: 'a'.repeat(64), name: 'Zebra', createdAt: 100, publishedAt: undefined }),
    makeTile({ id: 'b'.repeat(64), name: 'alpha', createdAt: 200, publishedAt: 300 }),
    makeTile({ id: 'c'.repeat(64), name: 'Beta', createdAt: 300, publishedAt: undefined }),
  ];

  it('does not mutate the input array', () => {
    const copy = [...tiles];
    sortMarketplaceTiles(tiles, 'newest');
    expect(tiles).toEqual(copy);
  });

  describe('newest', () => {
    it('prefers publishedAt, falls back to createdAt, descending', () => {
      const sorted = sortMarketplaceTiles(tiles, 'newest');
      // publishedAt:300 > createdAt:300 > createdAt:100
      expect(sorted[0].id).toBe('b'.repeat(64)); // publishedAt 300
      expect(sorted[1].id).toBe('c'.repeat(64)); // createdAt 300 (no publishedAt)
      expect(sorted[2].id).toBe('a'.repeat(64)); // createdAt 100 (no publishedAt)
    });
  });

  describe('recently-updated', () => {
    it('sorts by createdAt descending', () => {
      const sorted = sortMarketplaceTiles(tiles, 'recently-updated');
      expect(sorted[0].id).toBe('c'.repeat(64)); // createdAt 300
      expect(sorted[1].id).toBe('b'.repeat(64)); // createdAt 200
      expect(sorted[2].id).toBe('a'.repeat(64)); // createdAt 100
    });
  });

  describe('name', () => {
    it('sorts case-insensitive alphabetical ascending', () => {
      const sorted = sortMarketplaceTiles(tiles, 'name');
      expect(sorted[0].name).toBe('alpha');
      expect(sorted[1].name).toBe('Beta');
      expect(sorted[2].name).toBe('Zebra');
    });
  });
});

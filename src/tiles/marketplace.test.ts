import type { NostrEvent } from '@nostrify/nostrify';
import { finalizeEvent, getPublicKey } from 'nostr-tools';
import { describe, expect, it } from 'vitest';
import {
  getMarketplaceTiles,
  getMarketplaceTileStatus,
  searchMarketplaceTiles,
} from './marketplace';
import type { TileDefinition } from './definition';

const ALICE_PRIVATE_KEY = new Uint8Array(32).fill(1);
const BOB_PRIVATE_KEY = new Uint8Array(32).fill(2);
const ALICE = getPublicKey(ALICE_PRIVATE_KEY);
const BOB = getPublicKey(BOB_PRIVATE_KEY);

function tileEvent(identifier: string, pubkey: string, created_at: number, name: string, summary: string): NostrEvent {
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
    ],
  }, pubkey === BOB ? BOB_PRIVATE_KEY : ALICE_PRIVATE_KEY);
}

describe('marketplace tile selection', () => {
  it('keeps the newest valid definition per identifier and hides unverified authors', () => {
    const oldWeather = tileEvent('alice@example.com:weather', ALICE, 10, 'Old Weather', 'Forecasts');
    const newWeather = tileEvent('alice@example.com:weather', ALICE, 20, 'Weather', 'Forecasts');
    const unverifiedClock = tileEvent('bob@example.com:clock', BOB, 30, 'Clock', 'The time');

    const tiles = getMarketplaceTiles(
      [oldWeather, newWeather, unverifiedClock],
      new Map([['alice@example.com', ALICE]]),
    );

    expect(tiles).toHaveLength(1);
    expect(tiles[0]).toMatchObject({ identifier: 'alice@example.com:weather', name: 'Weather', createdAt: 20 });
  });

  it('searches name, summary, and NIP-05 namespace deterministically', () => {
    const tiles = getMarketplaceTiles([
      tileEvent('alice@example.com:weather', ALICE, 20, 'Weather', 'Forecasts'),
      tileEvent('alice@example.com:clock', ALICE, 10, 'Clock', 'The time'),
    ], new Map([['alice@example.com', ALICE]]));

    expect(searchMarketplaceTiles(tiles, 'forecast').map((tile) => tile.identifier)).toEqual(['alice@example.com:weather']);
    expect(searchMarketplaceTiles(tiles, 'alice@example').map((tile) => tile.identifier)).toEqual([
      'alice@example.com:weather',
      'alice@example.com:clock',
    ]);
  });

  it('distinguishes installable, installed, and update-ready tiles', () => {
    const tile: TileDefinition = {
      id: 'c'.repeat(64),
      pubkey: ALICE,
      createdAt: 20,
      identifier: 'alice@example.com:weather',
      name: 'Weather',
      version: '20',
      language: 'lua',
      script: 'function render() return ui.Text("tile") end',
      perms: [],
    };

    expect(getMarketplaceTileStatus(tile, undefined)).toBe('install');
    expect(getMarketplaceTileStatus(tile, { eventId: tile.id, createdAt: tile.createdAt })).toBe('installed');
    expect(getMarketplaceTileStatus(tile, { eventId: 'old-event', createdAt: 10 })).toBe('update');
  });
});

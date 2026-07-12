import type { NostrEvent } from '@nostrify/nostrify';
import type { TileDefinition } from './definition';
import { parseTileDefinition } from './definition';

export interface InstalledTile {
  eventId: string;
  createdAt: number;
}

export type MarketplaceTileStatus = 'install' | 'installed' | 'update';

export function getMarketplaceTiles(_events: NostrEvent[], _verifiedAuthors: Map<string, string>): TileDefinition[] {
  return getNewestTileDefinitions(_events).filter((tile) => {
    const nip05 = getTileNip05(tile.identifier);
    return !!nip05 && _verifiedAuthors.get(nip05) === tile.pubkey;
  });
}

export function getNewestTileDefinitions(events: NostrEvent[]): TileDefinition[] {
  const latest = new Map<string, TileDefinition>();

  for (const event of events) {
    const tile = parseTileDefinition(event);
    if (!tile) continue;

    const previous = latest.get(tile.identifier);
    if (!previous || tile.createdAt > previous.createdAt) latest.set(tile.identifier, tile);
  }

  return [...latest.values()].sort((a, b) => b.createdAt - a.createdAt);
}

export function searchMarketplaceTiles(tiles: TileDefinition[], _query: string): TileDefinition[] {
  const query = _query.trim().toLowerCase();
  if (!query) return tiles;

  return tiles.filter((tile) => [tile.name, tile.summary, getTileNip05(tile.identifier)]
    .some((value) => value?.toLowerCase().includes(query)));
}

export function getMarketplaceTileStatus(_tile: TileDefinition, _installed: InstalledTile | undefined): MarketplaceTileStatus {
  if (!_installed) return 'install';
  return _installed.eventId === _tile.id && _installed.createdAt === _tile.createdAt
    ? 'installed'
    : 'update';
}

export function getTileNip05(identifier: string): string | undefined {
  const separator = identifier.lastIndexOf(':');
  return separator > 0 ? identifier.slice(0, separator) : undefined;
}

import type { NostrEvent } from '@nostrify/nostrify';
import type { TileDefinition } from './definition';
import { parseTileDefinition } from './definition';

export type MarketplaceSortOrder = 'newest' | 'recently-updated' | 'name';

/** Sort tiles by the given order. Returns a new array; does not mutate the input. */
export function sortMarketplaceTiles(tiles: TileDefinition[], order: MarketplaceSortOrder): TileDefinition[] {
  const sorted = [...tiles];
  switch (order) {
    case 'newest':
      // Prefer the NIP-99 published_at tag, falling back to the event's created_at.
      sorted.sort((a, b) => (b.publishedAt ?? b.createdAt) - (a.publishedAt ?? a.createdAt));
      break;
    case 'recently-updated':
      sorted.sort((a, b) => b.createdAt - a.createdAt);
      break;
    case 'name':
      sorted.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
      break;
  }
  return sorted;
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

export function getTileNip05(identifier: string): string | undefined {
  const separator = identifier.lastIndexOf(':');
  return separator > 0 ? identifier.slice(0, separator) : undefined;
}

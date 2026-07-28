import type { NostrEvent } from '@nostrify/nostrify';
import { parseTileDefEvent, type Capability, type SettingsField, type RenderEntry, type NavEntry } from '@soapbox.pub/nostr-canvas';
import { sanitizeUrl } from '@/lib/sanitizeUrl';

export interface TileDefinition {
  id: string;
  pubkey: string;
  createdAt: number;
  identifier: string;
  name: string;
  version: string;
  language: string;
  script: string;
  image?: string;
  summary?: string;
  description?: string;
  perms: Capability[];
  settings?: SettingsField[];
  render?: RenderEntry;
  nav?: NavEntry;
  widget?: {
    label: string;
    icon?: string;
  };
}

export function parseTileDefinition(_event: NostrEvent): TileDefinition | null {
  const tile = parseTileDefEvent(_event);
  if (!tile) return null;

  return {
    ...tile,
    image: sanitizeUrl(tile.image),
  };
}

/** Number of views (render/nav/widget entry points) a tile declares. */
export function countTileViews(tile: TileDefinition): number {
  let count = 0;
  if (tile.render) count++;
  if (tile.nav) count++;
  if (tile.widget) count++;
  return count;
}

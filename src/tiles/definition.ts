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
  /** NIP-99 published_at tag value (Unix timestamp), if present. */
  publishedAt?: number;
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

  const publishedAtTag = _event.tags.find(([tag]) => tag === 'published_at')?.[1];
  const publishedAt = publishedAtTag ? Number(publishedAtTag) : undefined;

  return {
    ...tile,
    image: sanitizeUrl(tile.image),
    publishedAt: publishedAt && !isNaN(publishedAt) ? publishedAt : undefined,
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

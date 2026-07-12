import type { NostrEvent } from '@nostrify/nostrify';
import { parseTileDefEvent } from '@soapbox.pub/nostr-canvas';
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
  perms: string[];
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

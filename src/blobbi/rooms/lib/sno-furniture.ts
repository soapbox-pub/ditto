/**
 * SNO furniture — Simple Nostr Objects (kind 33331) placed in a Blobbi room.
 *
 * A placement names one by `sno:<naddr>`: the object's address as a relay-less
 * naddr, which fits the furniture schema's `namespace:slug` ID format, so
 * stored placements need no schema change and clients that don't know the
 * namespace skip them.
 */

import { nip19 } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';

import { isNostrId } from '@/lib/nostrId';
import { SNO_KIND } from '@/lib/sno';

export const SNO_FURNITURE_PREFIX = 'sno:';

/**
 * Longest furniture ID kept; `sno:` IDs are the long ones. Fits a `d` tag of
 * about 100 characters, and stops an object with a huge one from bloating
 * every profile it's placed in.
 */
export const MAX_FURNITURE_ID_LENGTH = 256;

export interface SnoAddress {
  pubkey: string;
  identifier: string;
}

/** Furniture ID for an SNO event, or undefined if it isn't a valid one. */
export function snoFurnitureId(event: Pick<NostrEvent, 'kind' | 'pubkey' | 'tags'>): string | undefined {
  if (event.kind !== SNO_KIND || !isNostrId(event.pubkey)) return undefined;
  const identifier = event.tags.find(([name]) => name === 'd')?.[1] ?? '';
  try {
    const id = SNO_FURNITURE_PREFIX + nip19.naddrEncode({ kind: SNO_KIND, pubkey: event.pubkey, identifier });
    return id.length <= MAX_FURNITURE_ID_LENGTH ? id : undefined;
  } catch {
    return undefined;
  }
}

/** The object address in an `sno:` furniture ID, or undefined. */
export function parseSnoFurnitureId(id: string): SnoAddress | undefined {
  if (!id.startsWith(SNO_FURNITURE_PREFIX)) return undefined;
  try {
    const decoded = nip19.decode(id.slice(SNO_FURNITURE_PREFIX.length));
    if (decoded.type !== 'naddr' || decoded.data.kind !== SNO_KIND || !isNostrId(decoded.data.pubkey)) return undefined;
    return { pubkey: decoded.data.pubkey, identifier: decoded.data.identifier };
  } catch {
    return undefined;
  }
}

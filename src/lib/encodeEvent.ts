import { nip19 } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';

/**
 * Encodes the canonical address-style NIP-19 identifier for an event,
 * preferring `naddr` for replaceable and addressable kinds (so the link
 * always resolves to the latest version of the event), and falling back
 * to `nevent` for regular kinds.
 *
 * Use this for navigation links inside feeds, share/copy menus, and any
 * UI where the user expects "the current version of this thing". For
 * pinning to a specific historical version (e.g. inside a profile-recovery
 * dialog showing past versions of a replaceable event), use
 * `encodeEventNevent` instead.
 *
 * Replaceable-kind classification:
 *  - Addressable kinds (30000–39999): `naddr` with the event's `d` tag.
 *  - Replaceable kinds (10000–19999): `naddr` with an empty identifier.
 *  - Legacy replaceable kinds below 1000 (kind 0 metadata, kind 3 follow
 *    list, kind 41 channel metadata): `naddr` with an empty identifier,
 *    matching NIP-01's per-kind storage semantics.
 *  - Everything else (regular kinds 1000–9999, ephemeral 20000–29999):
 *    `nevent` pinned to the event id.
 */
export function encodeEventAddress(event: NostrEvent): string {
  // Addressable events: 30000–39999 (require a d-tag to identify the row).
  if (event.kind >= 30000 && event.kind < 40000) {
    const dTag = event.tags.find(([n]) => n === 'd')?.[1];
    if (dTag) {
      return nip19.naddrEncode({ kind: event.kind, pubkey: event.pubkey, identifier: dTag });
    }
    // Fall through to nevent if the addressable event is malformed (no d-tag).
  }

  // Replaceable events: 10000–19999 (one row per (kind, pubkey)).
  if (event.kind >= 10000 && event.kind < 20000) {
    return nip19.naddrEncode({ kind: event.kind, pubkey: event.pubkey, identifier: '' });
  }

  // Legacy replaceable kinds below 1000 (NIP-01): kind 0 metadata, kind 3
  // follow list, kind 41 channel metadata. These follow the same
  // one-row-per-(kind, pubkey) rule, so prefer naddr for stable navigation.
  if (isLegacyReplaceableKind(event.kind)) {
    return nip19.naddrEncode({ kind: event.kind, pubkey: event.pubkey, identifier: '' });
  }

  return nip19.neventEncode({ id: event.id, author: event.pubkey });
}

/**
 * Encodes a NIP-19 `nevent` identifier pinned to the exact event id.
 *
 * Use this when the UI specifically needs to reference a historical or
 * point-in-time version of an event — e.g. profile-recovery dialogs that
 * list past versions of a replaceable event. For "go to the current
 * thing" navigation in feeds, use `encodeEventAddress` instead.
 */
export function encodeEventNevent(event: NostrEvent): string {
  return nip19.neventEncode({ id: event.id, author: event.pubkey });
}

/** Returns true for the legacy NIP-01 replaceable kinds below 1000. */
function isLegacyReplaceableKind(kind: number): boolean {
  return kind === 0 || kind === 3 || kind === 41;
}

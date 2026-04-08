// src/blobbi/house/lib/house-constants.ts

/**
 * Blobbi House — Constants and canonical identifiers.
 *
 * Kind 11127 is a replaceable event (10000–19999 range) that stores
 * the Blobbi House root: room layout, room scenes, and (future) furniture.
 *
 * One house per user, identified by a canonical d-tag derived from
 * the user's pubkey prefix.
 */

/** Kind number for the Blobbi House root event. */
export const KIND_BLOBBI_HOUSE = 11127;

/** Schema identifier embedded in the content `meta` block. */
export const HOUSE_SCHEMA = 'blobbi-house/v1';

/** Current content version. Bump when the schema changes. */
export const HOUSE_VERSION = 1;

/** Default house display name. */
export const HOUSE_DEFAULT_NAME = 'Blobbi House';

/**
 * Build the canonical d-tag for a user's Blobbi House.
 *
 * Format: `blobbi-house-{first12CharsOfPubkey}`
 *
 * This is deterministic — the same pubkey always produces the same d-tag,
 * so the house can be looked up without knowing the event ID.
 */
export function buildHouseDTag(pubkey: string): string {
  return `blobbi-house-${pubkey.slice(0, 12)}`;
}

/**
 * Build the standard tags array for a Blobbi House event.
 *
 * Tags:
 *   ["d", "blobbi-house-{pubkeyPrefix}"]
 *   ["b", "blobbi:ecosystem:v1"]
 *   ["name", "Blobbi House"]
 *   ["version", "1"]
 *   ["alt", "Blobbi House — room layout, scenes, and furniture"]
 */
export function buildHouseTags(pubkey: string): string[][] {
  return [
    ['d', buildHouseDTag(pubkey)],
    ['b', 'blobbi:ecosystem:v1'],
    ['name', HOUSE_DEFAULT_NAME],
    ['version', String(HOUSE_VERSION)],
    ['alt', 'Blobbi House \u2014 room layout, scenes, and furniture'],
  ];
}

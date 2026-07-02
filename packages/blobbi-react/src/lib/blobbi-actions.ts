/**
 * Blobbi action taxonomy.
 *
 * App-agnostic string-literal unions describing the care actions a Blobbi can
 * receive. These live in @blobbi/react (rather than a host-app's action-utils
 * module) so package code — e.g. the XP tables — can reference them without
 * pulling in any host-specific shop-catalog coupling.
 */

/**
 * Item-based care actions (use a catalog item on the companion).
 */
export type InventoryAction = 'feed' | 'play' | 'clean' | 'medicine' | 'boost';

/**
 * Direct actions that don't use items.
 * These actions affect stats directly without selecting a catalog item.
 */
export type DirectAction = 'play_music' | 'sing';

/**
 * All Blobbi actions (item-based + direct).
 */
export type BlobbiAction = InventoryAction | DirectAction;

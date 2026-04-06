/**
 * Centralized item-use cooldown tracking.
 *
 * Provides a single, shared per-item cooldown map used by every item-use
 * path (BlobbiPage dashboard, companion layer, shop modal, falling items).
 *
 * Design:
 * - Module-level singleton — all hooks share the same map.
 * - Keyed by item type ID (e.g. "food_apple"), NOT instance IDs.
 * - Separate durations for success (short) and failure (longer).
 * - Pure functions with no React dependency so they can be called from
 *   mutation callbacks, UI checks, or anywhere else.
 */

// ─── Configuration ────────────────────────────────────────────────────────────

/** Cooldown after a successful item use (ms). Short — lets rapid intentional taps through. */
export const ITEM_COOLDOWN_SUCCESS_MS = 500;

/** Cooldown after a failed item use (ms). Longer — prevents retry spam. */
export const ITEM_COOLDOWN_FAILURE_MS = 3000;

// ─── Singleton Map ────────────────────────────────────────────────────────────

interface CooldownEntry {
  /** Timestamp (Date.now()) when the cooldown expires */
  expiresAt: number;
}

/** Module-level cooldown map shared across all hooks. */
const cooldowns = new Map<string, CooldownEntry>();

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Check whether an item is currently on cooldown.
 * Automatically cleans up expired entries.
 */
export function isItemOnCooldown(itemId: string): boolean {
  const entry = cooldowns.get(itemId);
  if (!entry) return false;

  if (Date.now() >= entry.expiresAt) {
    cooldowns.delete(itemId);
    return false;
  }

  return true;
}

/**
 * Put an item on cooldown after a use attempt.
 *
 * @param itemId  - The shop catalog item ID
 * @param success - Whether the use attempt succeeded
 */
export function setItemCooldown(itemId: string, success: boolean): void {
  const ms = success ? ITEM_COOLDOWN_SUCCESS_MS : ITEM_COOLDOWN_FAILURE_MS;
  cooldowns.set(itemId, { expiresAt: Date.now() + ms });
}

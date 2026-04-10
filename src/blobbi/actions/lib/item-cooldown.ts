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
 * - Built-in subscriber system so React components can re-render when
 *   cooldowns start or expire.
 */

// ─── Configuration ────────────────────────────────────────────────────────────

/** Cooldown after a successful item use (ms). */
export const ITEM_COOLDOWN_SUCCESS_MS = 400;

/** Cooldown after a failed item use (ms). */
export const ITEM_COOLDOWN_FAILURE_MS = 2000;

// ─── Singleton State ──────────────────────────────────────────────────────────

interface CooldownEntry {
  /** Timestamp (Date.now()) when the cooldown expires */
  expiresAt: number;
  /** Timeout handle that fires the expiry notification */
  timerId: ReturnType<typeof setTimeout>;
}

/** Module-level cooldown map shared across all hooks. */
const cooldowns = new Map<string, CooldownEntry>();

/** Subscribers notified on every cooldown start/end. */
const subscribers = new Set<() => void>();

// ─── Internal Helpers ─────────────────────────────────────────────────────────

function notify(): void {
  subscribers.forEach((cb) => cb());
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Check whether an item is currently on cooldown.
 */
export function isItemOnCooldown(itemId: string): boolean {
  const entry = cooldowns.get(itemId);
  if (!entry) return false;

  if (Date.now() >= entry.expiresAt) {
    clearTimeout(entry.timerId);
    cooldowns.delete(itemId);
    return false;
  }

  return true;
}

/**
 * Put an item on cooldown after a use attempt.
 * Subscribers are notified immediately (cooldown started) and again when
 * the cooldown expires (so the UI can re-enable the button).
 */
export function setItemCooldown(itemId: string, success: boolean): void {
  // Clear any existing cooldown for this item
  const prev = cooldowns.get(itemId);
  if (prev) clearTimeout(prev.timerId);

  const ms = success ? ITEM_COOLDOWN_SUCCESS_MS : ITEM_COOLDOWN_FAILURE_MS;

  const timerId = setTimeout(() => {
    cooldowns.delete(itemId);
    notify(); // re-render: cooldown ended
  }, ms);

  cooldowns.set(itemId, { expiresAt: Date.now() + ms, timerId });

  notify(); // re-render: cooldown started
}

/**
 * Subscribe to cooldown state changes.
 * Returns an unsubscribe function.
 */
export function subscribeCooldowns(callback: () => void): () => void {
  subscribers.add(callback);
  return () => {
    subscribers.delete(callback);
  };
}

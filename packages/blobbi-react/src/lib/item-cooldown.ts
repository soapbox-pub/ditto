/**
 * Centralized item-use cooldown tracking.
 *
 * Module-level singleton shared by every item-use path
 * (dashboard, companion layer, shop modal, falling items).
 *
 * Keyed by item type ID (e.g. "food_apple"), not instance IDs.
 * Separate durations for success (short) and failure (longer).
 * Built-in subscriber system for React via useSyncExternalStore.
 */

// ─── Configuration ────────────────────────────────────────────────────────────

/** Cooldown after a successful item use (ms). */
export const ITEM_COOLDOWN_SUCCESS_MS = 400;

/** Cooldown after a failed item use (ms). */
export const ITEM_COOLDOWN_FAILURE_MS = 2000;

// ─── Singleton State ──────────────────────────────────────────────────────────

interface CooldownEntry {
  expiresAt: number;
  timerId: ReturnType<typeof setTimeout>;
}

const cooldowns = new Map<string, CooldownEntry>();
const subscribers = new Set<() => void>();

function notify(): void {
  subscribers.forEach((cb) => cb());
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Check whether an item is currently on cooldown. */
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

/** Put an item on cooldown. Notifies subscribers on start and expiry. */
export function setItemCooldown(itemId: string, success: boolean): void {
  const prev = cooldowns.get(itemId);
  if (prev) clearTimeout(prev.timerId);

  const ms = success ? ITEM_COOLDOWN_SUCCESS_MS : ITEM_COOLDOWN_FAILURE_MS;

  const timerId = setTimeout(() => {
    cooldowns.delete(itemId);
    notify();
  }, ms);

  cooldowns.set(itemId, { expiresAt: Date.now() + ms, timerId });
  notify();
}

/** Subscribe to cooldown state changes. Returns unsubscribe function. */
export function subscribeCooldowns(callback: () => void): () => void {
  subscribers.add(callback);
  return () => { subscribers.delete(callback); };
}

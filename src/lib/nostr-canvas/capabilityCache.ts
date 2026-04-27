/**
 * Persistent permission cache for nostr-canvas capabilities, scoped
 * per-logged-in-user pubkey.
 *
 * Each tile capability (get-pubkey, sign-event, publish-event, …) is
 * stored as a separate `granted` | `denied` decision keyed by tile
 * identifier. Decisions survive reloads via `localStorage`, and are
 * keyed by the active user's pubkey so that switching accounts does
 * not leak one user's grants to another.
 *
 * The cache is built on top of the library's own
 * `createPermissionCache` helper plus a `localStorage`-backed storage
 * adapter that matches the `MinimalStorage` interface the library
 * expects.
 */

import {
  createPermissionCache,
  createStoragePermissionBackend,
  type Capability,
  type MinimalStorage,
  type PermissionCache,
  type PermissionDecision,
} from '@soapbox.pub/nostr-canvas';

const STORAGE_KEY_PREFIX = 'nostr:canvas:perms:';

/**
 * Wrap `window.localStorage` with a `MinimalStorage` shim. On SSR or when
 * storage is unavailable, we fall back to an in-memory map so the runtime
 * still works (decisions just won't persist).
 */
function makeMinimalStorage(): MinimalStorage {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const probe = '__nc_probe__';
      window.localStorage.setItem(probe, '1');
      window.localStorage.removeItem(probe);
      return {
        getItem: (key) => window.localStorage.getItem(key),
        setItem: (key, value) => window.localStorage.setItem(key, value),
        removeItem: (key) => window.localStorage.removeItem(key),
      };
    } catch {
      // fall through to memory
    }
  }
  const mem = new Map<string, string>();
  return {
    getItem: (key) => mem.get(key) ?? null,
    setItem: (key, value) => void mem.set(key, value),
    removeItem: (key) => void mem.delete(key),
  };
}

/**
 * Create a permission cache scoped to the given user pubkey. Passing
 * `null` creates an anonymous cache under `<prefix>anon` that is wiped
 * on logout.
 *
 * The returned cache exposes the library's standard API:
 *  - `get(identifier, capability)` → cached decision or undefined
 *  - `set(identifier, capability, decision)`
 *  - `clear(identifier?)`
 */
export function createScopedPermissionCache(
  pubkey: string | null,
): PermissionCache {
  const storage = makeMinimalStorage();
  const scope = pubkey ?? 'anon';
  const backend = createStoragePermissionBackend(
    storage,
    `${STORAGE_KEY_PREFIX}${scope}:`,
  );
  return createPermissionCache(backend);
}

/**
 * Remove every cached permission decision for the given pubkey. Used
 * when the user asks to revoke all grants or when they log out and we
 * want a clean slate next time they return.
 */
export function clearScopedPermissions(pubkey: string | null): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  const scope = pubkey ?? 'anon';
  const prefix = `${STORAGE_KEY_PREFIX}${scope}:`;
  const keys: string[] = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (key && key.startsWith(prefix)) keys.push(key);
  }
  for (const key of keys) {
    window.localStorage.removeItem(key);
  }
}

/** A single stored permission decision. */
export interface PermissionEntry {
  identifier: string;
  capability: Capability;
  decision: PermissionDecision;
}

/**
 * Enumerate every permission decision stored under the given pubkey's
 * scope. The library itself doesn't expose enumeration (its cache only
 * provides `get`/`set`/`delete`), so we read `localStorage` keys
 * directly using the same `<prefix><identifier>\u0000<capability>` key
 * format that `createStoragePermissionBackend` writes.
 *
 * Returns an empty array when `localStorage` is unavailable.
 */
export function listScopedPermissions(pubkey: string | null): PermissionEntry[] {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  const scope = pubkey ?? 'anon';
  const prefix = `${STORAGE_KEY_PREFIX}${scope}:`;
  const out: PermissionEntry[] = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (!key || !key.startsWith(prefix)) continue;
    const rest = key.slice(prefix.length);
    const sep = rest.indexOf('\u0000');
    if (sep === -1) continue;
    const identifier = rest.slice(0, sep);
    const capability = rest.slice(sep + 1) as Capability;
    const value = window.localStorage.getItem(key);
    if (value === 'granted' || value === 'denied') {
      out.push({ identifier, capability, decision: value });
    }
  }
  return out;
}

/**
 * Forget a single `(identifier, capability)` decision under the given
 * pubkey's scope. No-op when the decision wasn't set.
 */
export function revokeScopedPermission(
  pubkey: string | null,
  identifier: string,
  capability: Capability,
): void {
  // Reuse the same key format `createStoragePermissionBackend` writes.
  if (typeof window === 'undefined' || !window.localStorage) return;
  const scope = pubkey ?? 'anon';
  const key = `${STORAGE_KEY_PREFIX}${scope}:${identifier}\u0000${capability}`;
  window.localStorage.removeItem(key);
}

/**
 * Forget every stored permission decision for a given tile identifier
 * under the given pubkey's scope. Called when a tile is uninstalled so
 * reinstalling it doesn't silently resurrect old grants.
 */
export function forgetTilePermissions(
  pubkey: string | null,
  identifier: string,
): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  for (const entry of listScopedPermissions(pubkey)) {
    if (entry.identifier === identifier) {
      revokeScopedPermission(pubkey, identifier, entry.capability);
    }
  }
}

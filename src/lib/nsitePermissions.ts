/**
 * Permission model and localStorage persistence for nsite NIP-07 signer proxy.
 *
 * Permissions are scoped to (userPubkey, siteId) and are granular:
 * - `signEvent` permissions are stored per event kind
 * - Encryption/decryption permissions are stored per operation type
 *
 * `getPublicKey` is always allowed (clicking "Run" implies consent) and is
 * not tracked in this system.
 */
import { getKindLabel } from '@/lib/kindLabels';

// Re-export so existing consumers of `getKindLabel` from this module keep working.
export { getKindLabel } from '@/lib/kindLabels';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Operations that require permission. `getPublicKey` is always allowed. */
export type NsitePermissionType =
  | 'signEvent'
  | 'nip04.encrypt'
  | 'nip04.decrypt'
  | 'nip44.encrypt'
  | 'nip44.decrypt';

/** A single remembered permission decision. */
export interface NsitePermission {
  /** Operation type. */
  type: NsitePermissionType;
  /** Event kind — only meaningful for `signEvent`, null otherwise. */
  kind: number | null;
  /** Whether this operation is allowed. */
  allowed: boolean;
}

/** All remembered permissions for one (user, site) pair. */
export interface NsiteAllowance {
  /** Canonical nsite subdomain identifier (from `getNsiteSubdomain`). */
  siteId: string;
  /** Human-readable site name. */
  siteName: string;
  /** Hex pubkey of the user who granted the permissions. */
  userPubkey: string;
  /** Individual permission decisions. */
  permissions: NsitePermission[];
  /** Unix timestamp (ms) when this allowance was first created. */
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'nostr:nsite-permissions';

/** Read all allowances from localStorage. */
function readAllowances(): NsiteAllowance[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Write all allowances to localStorage and notify same-tab subscribers. */
function writeAllowances(allowances: NsiteAllowance[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(allowances));
  // The `storage` event only fires across tabs. Dispatch a custom event so
  // same-tab subscribers (e.g. NsitePermissionManager) also re-render.
  window.dispatchEvent(new Event('nsite-permissions-changed'));
}

/** Find the allowance for a specific (siteId, userPubkey) pair. */
function findAllowance(
  allowances: NsiteAllowance[],
  siteId: string,
  userPubkey: string,
): NsiteAllowance | undefined {
  return allowances.find(
    (a) => a.siteId === siteId && a.userPubkey === userPubkey,
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Look up a stored permission decision.
 *
 * @returns `'allow'` or `'deny'` if remembered, `'ask'` if no decision stored.
 */
export function getNsitePermission(
  siteId: string,
  userPubkey: string,
  type: NsitePermissionType,
  kind: number | null = null,
): 'allow' | 'deny' | 'ask' {
  const allowances = readAllowances();
  const allowance = findAllowance(allowances, siteId, userPubkey);
  if (!allowance) return 'ask';

  const match = allowance.permissions.find((p) => {
    if (p.type !== type) return false;
    // For signEvent, match on kind; for others kind is always null.
    if (type === 'signEvent') return p.kind === kind;
    return true;
  });

  if (!match) return 'ask';
  return match.allowed ? 'allow' : 'deny';
}

/**
 * Store a permission decision. Creates the allowance if it doesn't exist.
 * Updates an existing permission entry if one matches.
 */
export function setNsitePermission(
  siteId: string,
  userPubkey: string,
  siteName: string,
  type: NsitePermissionType,
  kind: number | null,
  allowed: boolean,
): void {
  const allowances = readAllowances();
  let allowance = findAllowance(allowances, siteId, userPubkey);

  if (!allowance) {
    allowance = {
      siteId,
      siteName,
      userPubkey,
      permissions: [],
      createdAt: Date.now(),
    };
    allowances.push(allowance);
  }

  // Find existing entry for this (type, kind) pair.
  const idx = allowance.permissions.findIndex((p) => {
    if (p.type !== type) return false;
    if (type === 'signEvent') return p.kind === kind;
    return true;
  });

  const entry: NsitePermission = { type, kind, allowed };

  if (idx >= 0) {
    allowance.permissions[idx] = entry;
  } else {
    allowance.permissions.push(entry);
  }

  writeAllowances(allowances);
}

/**
 * Remove a single permission entry from a site's allowance.
 */
export function removeNsitePermission(
  siteId: string,
  userPubkey: string,
  type: NsitePermissionType,
  kind: number | null,
): void {
  const allowances = readAllowances();
  const allowance = findAllowance(allowances, siteId, userPubkey);
  if (!allowance) return;

  allowance.permissions = allowance.permissions.filter((p) => {
    if (p.type !== type) return true;
    if (type === 'signEvent') return p.kind !== kind;
    return false;
  });

  // Remove the allowance entirely if no permissions remain.
  if (allowance.permissions.length === 0) {
    const idx = allowances.indexOf(allowance);
    if (idx >= 0) allowances.splice(idx, 1);
  }

  writeAllowances(allowances);
}

/**
 * Clear all stored permissions for a site.
 */
export function clearNsitePermissions(
  siteId: string,
  userPubkey: string,
): void {
  const allowances = readAllowances();
  const filtered = allowances.filter(
    (a) => !(a.siteId === siteId && a.userPubkey === userPubkey),
  );
  writeAllowances(filtered);
}

/**
 * Get the full allowance record for a site, or undefined if none exists.
 */
export function getNsiteAllowance(
  siteId: string,
  userPubkey: string,
): NsiteAllowance | undefined {
  return findAllowance(readAllowances(), siteId, userPubkey);
}

// ---------------------------------------------------------------------------
// Human-readable labels
// ---------------------------------------------------------------------------

/** Get a human-readable label for a permission type and optional kind. */
export function getPermissionLabel(
  type: NsitePermissionType,
  kind: number | null,
): string {
  switch (type) {
    case 'signEvent': {
      if (kind === null) return 'Sign event';
      return `Sign: ${getKindLabel(kind)}`;
    }
    case 'nip04.encrypt':
      return 'Encrypt (NIP-04)';
    case 'nip04.decrypt':
      return 'Decrypt (NIP-04)';
    case 'nip44.encrypt':
      return 'Encrypt (NIP-44)';
    case 'nip44.decrypt':
      return 'Decrypt (NIP-44)';
  }
}

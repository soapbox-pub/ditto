/**
 * Permission model and localStorage persistence for nsite NIP-07 signer proxy.
 *
 * Permissions are scoped to (userPubkey, siteId) and are granular:
 * - `signEvent` permissions are stored per event kind, and per `d` tag for
 *   kind 30078 app data (so a grant to write one app's record can't be used to
 *   overwrite another's, e.g. Ditto's wallet backup)
 * - Decryption of the user's own data (ciphertext encrypted to their own key)
 *   is stored per identified record — kind, plus `d` tag for kind 30078
 * - Other encryption/decryption permissions are stored per operation type
 *
 * `getPublicKey` is always allowed (clicking "Run" implies consent) and is
 * not tracked in this system.
 */
import { defineMessages, type IntlShape } from 'react-intl';

import { getKindLabel } from '@/lib/kindLabels';
import { MONERO_RECORD_D_SUFFIX } from '@/lib/monero/record';

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
  /**
   * Event kind. For `signEvent`, the kind being signed. For decrypt, the kind
   * of the user's own record being read — null means messages with others.
   */
  kind: number | null;
  /** `d` tag of the targeted kind 30078 record, null otherwise. */
  dTag?: string | null;
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

/** Identifies what a permission applies to. */
export interface NsitePermissionScope {
  type: NsitePermissionType;
  kind: number | null;
  dTag: string | null;
}

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'nostr:nsite-permissions';

/**
 * Kind 30078 signing grants from before they were scoped per `d` tag. They no
 * longer match any request, so drop them rather than list them as active.
 */
function isLegacyAppDataGrant(p: NsitePermission): boolean {
  return p.type === 'signEvent' && p.kind === 30078 && (p.dTag ?? null) === null;
}

/** Read all allowances from localStorage. */
function readAllowances(): NsiteAllowance[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return (parsed as NsiteAllowance[]).map((a) => ({
      ...a,
      // Guard against a malformed entry: throwing here would return [] and
      // the next write would erase every site's permissions.
      permissions: Array.isArray(a.permissions) ? a.permissions.filter((p) => !isLegacyAppDataGrant(p)) : [],
    }));
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

/** Whether a stored permission applies to the given scope. */
function matchesScope(p: NsitePermission, scope: NsitePermissionScope): boolean {
  return p.type === scope.type
    && (p.kind ?? null) === scope.kind
    && (p.dTag ?? null) === scope.dTag;
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
  scope: NsitePermissionScope,
): 'allow' | 'deny' | 'ask' {
  const allowance = findAllowance(readAllowances(), siteId, userPubkey);
  if (!allowance) return 'ask';

  const match = allowance.permissions.find((p) => matchesScope(p, scope));

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
  scope: NsitePermissionScope,
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

  const idx = allowance.permissions.findIndex((p) => matchesScope(p, scope));
  const entry: NsitePermission = { ...scope, allowed };

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
  scope: NsitePermissionScope,
): void {
  const allowances = readAllowances();
  const allowance = findAllowance(allowances, siteId, userPubkey);
  if (!allowance) return;

  allowance.permissions = allowance.permissions.filter((p) => !matchesScope(p, scope));

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
 * Clear every site's stored permissions for a user.
 */
export function clearAllNsitePermissionsForUser(userPubkey: string): void {
  const allowances = readAllowances();
  const filtered = allowances.filter((a) => a.userPubkey !== userPubkey);
  if (filtered.length !== allowances.length) writeAllowances(filtered);
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

/** One of the user's own records that an nsite wants to read or write. */
export interface NsiteRecordInfo {
  /**
   * Ditto's Monero wallet backup, Ditto's settings, another app's kind 30078
   * data, or a record identified only by its kind.
   */
  type: 'wallet' | 'settings' | 'appData' | 'kind';
  kind: number;
  /** `d` tag, for app data. */
  dTag?: string;
  /** Holds key material or settings — never remember decisions about it. */
  sensitive: boolean;
}

/**
 * Describe a record of the user's that an nsite wants to read or write.
 * Ditto's own kind 30078 records get a name; other apps' records show the raw
 * `d` tag, since that's the only identifier they have.
 */
export function describeNsiteRecord(
  kind: number,
  dTag: string | null,
  appId: string,
): NsiteRecordInfo {
  if (kind === 30078 && dTag !== null) {
    if (dTag === `${appId}/${MONERO_RECORD_D_SUFFIX}`) {
      return { type: 'wallet', kind, sensitive: true };
    }
    if (dTag === `${appId}/metadata`) {
      return { type: 'settings', kind, sensitive: true };
    }
    return { type: 'appData', kind, dTag, sensitive: false };
  }
  return { type: 'kind', kind, sensitive: false };
}

const messages = defineMessages({
  wallet: { id: 'nsite.record.wallet', defaultMessage: 'Ditto Monero wallet' },
  settings: { id: 'nsite.record.settings', defaultMessage: 'Ditto settings' },
  appData: { id: 'nsite.record.appData', defaultMessage: 'App data "{dTag}"' },
  signEvent: { id: 'nsite.permission.signEvent', defaultMessage: 'Sign event' },
  signKind: { id: 'nsite.permission.signKind', defaultMessage: 'Sign: {label}' },
  write: { id: 'nsite.permission.write', defaultMessage: 'Write: {label}' },
  read: { id: 'nsite.permission.read', defaultMessage: 'Read: {label}' },
  nip04Encrypt: { id: 'nsite.permission.nip04Encrypt', defaultMessage: 'Encrypt (NIP-04)' },
  nip44Encrypt: { id: 'nsite.permission.nip44Encrypt', defaultMessage: 'Encrypt (NIP-44)' },
  nip04Decrypt: { id: 'nsite.permission.nip04Decrypt', defaultMessage: 'Decrypt messages (NIP-04)' },
  nip44Decrypt: { id: 'nsite.permission.nip44Decrypt', defaultMessage: 'Decrypt messages (NIP-44)' },
});

/** A record's name, e.g. "Ditto settings" or `App data "foo/bar"`. */
export function formatNsiteRecord(record: NsiteRecordInfo, intl: IntlShape): string {
  switch (record.type) {
    case 'wallet':
      return intl.formatMessage(messages.wallet);
    case 'settings':
      return intl.formatMessage(messages.settings);
    case 'appData':
      return intl.formatMessage(messages.appData, { dTag: record.dTag ?? '' });
    case 'kind':
      return getKindLabel(record.kind);
  }
}

/** Get a human-readable label for a stored permission. */
export function getPermissionLabel(
  permission: Pick<NsitePermission, 'type' | 'kind' | 'dTag'>,
  appId: string,
  intl: IntlShape,
): string {
  const { type, kind } = permission;
  const dTag = permission.dTag ?? null;

  switch (type) {
    case 'signEvent': {
      if (kind === null) return intl.formatMessage(messages.signEvent);
      if (kind === 30078 && dTag !== null) {
        return intl.formatMessage(messages.write, { label: formatNsiteRecord(describeNsiteRecord(kind, dTag, appId), intl) });
      }
      return intl.formatMessage(messages.signKind, { label: getKindLabel(kind) });
    }
    case 'nip04.encrypt':
      return intl.formatMessage(messages.nip04Encrypt);
    case 'nip44.encrypt':
      return intl.formatMessage(messages.nip44Encrypt);
    case 'nip04.decrypt':
    case 'nip44.decrypt': {
      if (kind !== null) {
        return intl.formatMessage(messages.read, { label: formatNsiteRecord(describeNsiteRecord(kind, dTag, appId), intl) });
      }
      return intl.formatMessage(type === 'nip04.decrypt' ? messages.nip04Decrypt : messages.nip44Decrypt);
    }
  }
}

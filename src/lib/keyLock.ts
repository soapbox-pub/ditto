import { useSyncExternalStore } from 'react';
import { getPublicKey, nip19 } from 'nostr-tools';

import { decryptNcryptsec, NcryptsecError } from '@/lib/ncryptsec';

/**
 * Password lock for nsec logins (NIP-49). A locked account's entry in the
 * login store is its ncryptsec only (an `x-ncryptsec` login), so no nsec is at
 * rest on the device; it is opened in memory at launch, behind `UnlockScreen`.
 *
 * Which accounts are locked lives in localStorage (`ditto:key-lock:<pubkey>`,
 * holding the ncryptsec) rather than in one tab's memory, so every tab seals
 * the same accounts whenever it writes the login list.
 */

const LOCK_PREFIX = 'ditto:key-lock:';
const AUTO_LOCK_KEY = 'ditto:auto-lock-minutes';
/**
 * The ncryptsec this account logged in with or created here. Safe to keep
 * beside the account (it's the password-sealed form), and it means the user
 * already holds a password-protected backup.
 */
const NCRYPTSEC_PREFIX = 'ditto:ncryptsec:';
/**
 * A locked account logged out on this device. Another tab may still hold its
 * key open, and with the lock flag gone its next write would put the nsec on
 * disk in plain text; this tells it to leave the account out instead. Cleared
 * when the account is next given a lock state, i.e. logged in again.
 */
const FORGOTTEN_PREFIX = 'ditto:key-forgotten:';
export const SEALED_LOGIN_TYPE = 'x-ncryptsec';

interface StoredLogin {
  id: string;
  type: string;
  pubkey: string;
  createdAt: string;
  data: Record<string, unknown> | null;
}

const listeners = new Set<() => void>();
const notify = () => {
  for (const l of listeners) l();
};

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (
      e.key === null ||
      e.key.startsWith(LOCK_PREFIX) ||
      e.key.startsWith(NCRYPTSEC_PREFIX) ||
      e.key.startsWith(FORGOTTEN_PREFIX) ||
      e.key === AUTO_LOCK_KEY
    ) listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

/** The ncryptsec this account's login is sealed under, or `null` when it isn't locked. */
export function lockedNcryptsec(pubkey: string): string | null {
  try {
    return localStorage.getItem(LOCK_PREFIX + pubkey);
  } catch {
    return null;
  }
}

/** Lock (`ncryptsec`) or unlock (`null`) an account. Takes effect at the next login-list write. */
export function setKeyLock(pubkey: string, ncryptsec: string | null): void {
  try {
    if (ncryptsec) localStorage.setItem(LOCK_PREFIX + pubkey, ncryptsec);
    else localStorage.removeItem(LOCK_PREFIX + pubkey);
    localStorage.removeItem(FORGOTTEN_PREFIX + pubkey);
  } catch { /* ignore */ }
  notify();
}

function keyForgotten(pubkey: string): boolean {
  try {
    return localStorage.getItem(FORGOTTEN_PREFIX + pubkey) !== null;
  } catch {
    return false;
  }
}

/** Whether any of these accounts was a locked one logged out since this tab opened its key. */
export function useAnyKeyForgotten(pubkeys: string[]): boolean {
  return useSyncExternalStore(
    subscribe,
    () => pubkeys.some(keyForgotten),
    () => false,
  );
}

export function useKeyLocked(pubkey: string | undefined): boolean {
  return useAnyKeyLocked(pubkey ? [pubkey] : []);
}

/** Whether any of these accounts is locked. */
export function useAnyKeyLocked(pubkeys: string[]): boolean {
  return useSyncExternalStore(
    subscribe,
    () => pubkeys.some((pubkey) => lockedNcryptsec(pubkey) !== null),
    () => false,
  );
}

export function recordNcryptsec(pubkey: string, ncryptsec: string): void {
  try {
    localStorage.setItem(NCRYPTSEC_PREFIX + pubkey, ncryptsec);
  } catch { /* ignore */ }
  notify();
}

export function recordedNcryptsec(pubkey: string): string | null {
  try {
    return localStorage.getItem(NCRYPTSEC_PREFIX + pubkey);
  } catch {
    return null;
  }
}

/** Drop an account's lock and recorded ncryptsec, once it's gone from this device. */
export function forgetKeyLock(pubkey: string): void {
  try {
    if (lockedNcryptsec(pubkey) !== null) localStorage.setItem(FORGOTTEN_PREFIX + pubkey, '1');
    localStorage.removeItem(LOCK_PREFIX + pubkey);
    localStorage.removeItem(NCRYPTSEC_PREFIX + pubkey);
  } catch { /* ignore */ }
  notify();
}

/** {@link recordedNcryptsec}, live. */
export function useRecordedNcryptsec(pubkey: string | undefined): string | null {
  return useSyncExternalStore(
    subscribe,
    () => (pubkey ? recordedNcryptsec(pubkey) : null),
    () => null,
  );
}

export const AUTO_LOCK_CHOICES = [1, 5, 15, 60, 0] as const;
/** `0` = only when the app is next opened. */
export type AutoLockMinutes = (typeof AUTO_LOCK_CHOICES)[number];
const DEFAULT_AUTO_LOCK: AutoLockMinutes = 15;

export function autoLockMinutes(): AutoLockMinutes {
  try {
    const raw = localStorage.getItem(AUTO_LOCK_KEY);
    const n = Number(raw);
    return raw !== null && (AUTO_LOCK_CHOICES as readonly number[]).includes(n) ? (n as AutoLockMinutes) : DEFAULT_AUTO_LOCK;
  } catch {
    return DEFAULT_AUTO_LOCK;
  }
}

export function setAutoLockMinutes(minutes: AutoLockMinutes): void {
  try {
    localStorage.setItem(AUTO_LOCK_KEY, String(minutes));
  } catch { /* ignore */ }
  notify();
}

export function useAutoLockMinutes(): AutoLockMinutes {
  return useSyncExternalStore(subscribe, autoLockMinutes, () => DEFAULT_AUTO_LOCK);
}

function parseList(value: string): StoredLogin[] | null {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as StoredLogin[]) : null;
  } catch {
    return null;
  }
}

/**
 * The login list as it may be written to disk: locked accounts' nsecs replaced
 * by their ncryptsec, and locked accounts logged out elsewhere left out.
 */
export function sealLoginList(value: string): string {
  const list = parseList(value);
  if (!list) return value;
  let changed = false;
  const sealed: StoredLogin[] = [];
  for (const login of list) {
    if (login?.type !== 'nsec') {
      sealed.push(login);
      continue;
    }
    if (keyForgotten(login.pubkey)) {
      changed = true;
      continue;
    }
    const ncryptsec = lockedNcryptsec(login.pubkey);
    if (!ncryptsec) {
      sealed.push(login);
      continue;
    }
    changed = true;
    sealed.push({ id: login.id, type: SEALED_LOGIN_TYPE, pubkey: login.pubkey, createdAt: login.createdAt, data: { ncryptsec } });
  }
  return changed ? JSON.stringify(sealed) : value;
}

export type UnlockResult = 'ok' | 'password' | 'malformed';

export interface UnlockRequest {
  pubkey: string;
  /** Locked accounts still to open, this one included. */
  remaining: number;
  unlock(password: string): Promise<UnlockResult>;
  /** Drop this account from the device; its ncryptsec backup is what's left. */
  forget(): void;
}

let request: UnlockRequest | null = null;
const requestListeners = new Set<() => void>();

function setRequest(next: UnlockRequest | null): void {
  request = next;
  for (const l of requestListeners) l();
}

export function useUnlockRequest(): UnlockRequest | null {
  return useSyncExternalStore(
    (l) => {
      requestListeners.add(l);
      return () => requestListeners.delete(l);
    },
    () => request,
    () => null,
  );
}

async function open(ncryptsec: string, pubkey: string, password: string): Promise<Uint8Array> {
  const sk = await decryptNcryptsec(ncryptsec, password);
  if (getPublicKey(sk) !== pubkey) {
    sk.fill(0);
    throw new NcryptsecError('malformed');
  }
  return sk;
}

/**
 * The login list as read from disk, with every sealed account opened by its
 * password through {@link useUnlockRequest}. Resolves only once each is
 * unlocked or forgotten, which holds `NostrLoginProvider` on its fallback.
 */
export async function openLoginList(value: string | null): Promise<string | null> {
  if (value === null) return value;
  const list = parseList(value);
  if (!list || !list.some((login) => login?.type === SEALED_LOGIN_TYPE)) return value;

  const sealedCount = list.filter((login) => login?.type === SEALED_LOGIN_TYPE).length;
  let opened = 0;
  // Several accounts usually share one password; try the last one before asking again.
  let lastPassword: string | undefined;
  const out: StoredLogin[] = [];
  try {
    for (const login of list) {
      if (login?.type !== SEALED_LOGIN_TYPE) {
        out.push(login);
        continue;
      }
      const ncryptsec = String(login.data?.ncryptsec ?? '');
      // The store says locked; keep the flag even if localStorage lost it.
      if (lockedNcryptsec(login.pubkey) !== ncryptsec) setKeyLock(login.pubkey, ncryptsec);

      let sk: Uint8Array | null = null;
      if (lastPassword !== undefined) {
        try {
          sk = await open(ncryptsec, login.pubkey, lastPassword);
        } catch { /* ask */ }
      }
      if (!sk) {
        sk = await new Promise<Uint8Array | null>((resolve) => {
          setRequest({
            pubkey: login.pubkey,
            remaining: sealedCount - opened,
            async unlock(password) {
              try {
                const opened = await open(ncryptsec, login.pubkey, password);
                lastPassword = password;
                resolve(opened);
                return 'ok';
              } catch (err) {
                return err instanceof NcryptsecError ? err.reason : 'malformed';
              }
            },
            forget() {
              forgetKeyLock(login.pubkey);
              resolve(null);
            },
          });
        });
      }
      opened++;
      if (!sk) continue;
      try {
        out.push({ id: login.id, type: 'nsec', pubkey: login.pubkey, createdAt: login.createdAt, data: { nsec: nip19.nsecEncode(sk) } });
      } finally {
        sk.fill(0);
      }
    }
  } finally {
    lastPassword = undefined;
    setRequest(null);
  }
  return JSON.stringify(out);
}

/** Locking is a reload: the only way to be sure no decrypted key is left in this page's memory. */
export function lockNow(): void {
  window.location.reload();
}

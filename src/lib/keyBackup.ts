import { Capacitor } from '@capacitor/core';
import { useSyncExternalStore } from 'react';

/**
 * Per-account marker for a key signup made on this device, ported from
 * Armada. It drives two things:
 *
 * - **Not backed up** (`backedUp: false`): the save prompt at signup was
 *   dismissed, so this device holds the only copy. Logout is guarded and the
 *   reminder keeps asking until the key leaves the screen (copy, file, keyring).
 * - **Not protected** (web only): a backed-up web key still sits unencrypted in
 *   localStorage, so the reminder pitches the password lock or a signer once.
 *
 * Device-local on purpose: an account signed in anywhere else was signed in
 * with a key the user already had.
 */

const PREFIX = 'ditto:key-safety:';
const storageKey = (pubkey: string) => PREFIX + pubkey;

/** The first reminder waits this long after signup, so onboarding itself isn't interrupted. */
export const KEY_REMINDER_FIRST_MS = 60 * 60 * 1000;
/** Dismissing a backup reminder pushes it back this far. */
export const KEY_REMINDER_SNOOZE_MS = 24 * 60 * 60 * 1000;

export interface KeySafetyMarker {
  /** When the reminder is next due. */
  remindAt: number;
  /** Whether the key has left this device (copy, file, keyring). */
  backedUp: boolean;
}

const listeners = new Set<() => void>();
const notify = () => {
  for (const l of listeners) l();
};

function readRaw(pubkey: string): string | null {
  try {
    return localStorage.getItem(storageKey(pubkey));
  } catch {
    return null;
  }
}

function parse(raw: string | null): KeySafetyMarker | null {
  if (raw === null) return null;
  // A marker we can't read still means "not backed up": remind now rather than never.
  try {
    const value = JSON.parse(raw) as Partial<KeySafetyMarker> | null;
    return {
      remindAt: typeof value?.remindAt === 'number' ? value.remindAt : 0,
      backedUp: value?.backedUp === true,
    };
  } catch {
    return { remindAt: 0, backedUp: false };
  }
}

function write(pubkey: string, marker: KeySafetyMarker): void {
  try {
    localStorage.setItem(storageKey(pubkey), JSON.stringify(marker));
  } catch { /* ignore */ }
  notify();
}

export function clearKeyReminder(pubkey: string): void {
  try {
    localStorage.removeItem(storageKey(pubkey));
  } catch { /* ignore */ }
  notify();
}

export function keySafetyMarker(pubkey: string): KeySafetyMarker | null {
  return parse(readRaw(pubkey));
}

/** Logging out now would destroy the only copy of this key. */
export function keyBackupPending(pubkey: string): boolean {
  const marker = keySafetyMarker(pubkey);
  return marker !== null && !marker.backedUp;
}

/**
 * A key signup just made. Native apps keep it in the Keychain/KeyStore, so a
 * backed-up native key has nothing left to remind about.
 */
export function markNewKey(pubkey: string, backedUp: boolean, now = Date.now()): void {
  if (backedUp && Capacitor.isNativePlatform()) return;
  write(pubkey, { remindAt: now + KEY_REMINDER_FIRST_MS, backedUp });
}

/** The key has left the screen. On the web the protection pitch is still owed. */
export function markKeyBackedUp(pubkey: string): void {
  const marker = keySafetyMarker(pubkey);
  if (!marker || marker.backedUp) return;
  if (Capacitor.isNativePlatform()) clearKeyReminder(pubkey);
  else write(pubkey, { ...marker, backedUp: true });
}

/** The key is now password-locked on this device: once backed up, nothing is owed. */
export function markKeyProtected(pubkey: string): void {
  if (keySafetyMarker(pubkey)?.backedUp) clearKeyReminder(pubkey);
}

/** Dismissed: a missing backup is asked about again tomorrow; the protection pitch only once. */
export function snoozeKeyReminder(pubkey: string, now = Date.now()): void {
  const marker = keySafetyMarker(pubkey);
  if (!marker) return;
  if (marker.backedUp) clearKeyReminder(pubkey);
  else write(pubkey, { ...marker, remindAt: now + KEY_REMINDER_SNOOZE_MS });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Another tab backing the key up counts here too.
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key.startsWith(PREFIX)) listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

/** {@link keySafetyMarker}, live. */
export function useKeySafetyMarker(pubkey: string | undefined): KeySafetyMarker | null {
  const raw = useSyncExternalStore(
    subscribe,
    () => (pubkey ? readRaw(pubkey) : null),
    () => null,
  );
  return parse(raw);
}

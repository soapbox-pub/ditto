/**
 * useWelcomeTour — controls the post-signup Welcome Tour.
 *
 * The tour itself is rendered by a globally-mounted `<WelcomeTourFlow />`
 * which lives inside `<AppRouter>`. Because `<InitialSyncGate>` may withhold
 * AppRouter while it shows the signup flow, the OutroStep button can fire
 * `start()` *before* the WelcomeTourFlow ever mounts. To survive that
 * mount-after-call ordering we use a small module-scoped store (a single
 * boolean intent flag) that the flow component reads via
 * `useSyncExternalStore`. The flow consumes the intent on mount, so a
 * `start()` call always opens the tour as soon as the flow renders.
 *
 * Persistence of the "seen" flag is per-pubkey via localStorage (key:
 * `welcome-tour-seen-v1:<pubkey>`) so multi-account devices behave correctly.
 *
 * API:
 *   - `start()`          — sets the intent flag; flow opens at step 0 on next read.
 *   - `markSeen()`       — persists "seen" for the current pubkey.
 *   - `maybeAutoStart()` — calls `start()` only if the current user has never
 *                          seen the tour. Used by the Blobbi hatching
 *                          ceremony's `onComplete` so the tour auto-fires once
 *                          after a user hatches their first Blobbi.
 */

import { useCallback, useSyncExternalStore } from 'react';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useLocalStorage } from '@/hooks/useLocalStorage';

/** localStorage key prefix. Bump the suffix to force a re-fire after big tour changes. */
const STORAGE_PREFIX = 'welcome-tour-seen-v1';

function storageKeyFor(pubkey: string | undefined): string {
  return `${STORAGE_PREFIX}:${pubkey ?? '_anon'}`;
}

// ─── Module-scoped intent store ─────────────────────────────────────────────
//
// Survives component (un)mounts within the page session. NOT persisted across
// reloads — partial-tour state is intentionally ephemeral.

let wantsToOpen = false;
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((l) => l());
}

function subscribeIntent(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getIntentSnapshot(): boolean {
  return wantsToOpen;
}

/** Imperatively set the intent flag. Public so `WelcomeTourFlow` can clear it. */
export function setTourIntent(open: boolean): void {
  if (wantsToOpen === open) return;
  wantsToOpen = open;
  notify();
}

/**
 * Subscribe to the tour intent flag. Returns `true` while a `start()` call is
 * pending consumption by `<WelcomeTourFlow>`.
 */
export function useTourIntent(): boolean {
  return useSyncExternalStore(subscribeIntent, getIntentSnapshot, getIntentSnapshot);
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export interface UseWelcomeTourResult {
  /** Whether the current pubkey has finished or skipped the tour at least once. */
  hasSeen: boolean;
  /** Request the tour modal open at step 0 (replay-safe). */
  start: () => void;
  /** Mark the tour as seen for the current pubkey. Called by the flow on finish/skip. */
  markSeen: () => void;
  /**
   * Open the tour only if the current pubkey has never seen it.
   * Intended to be called from BlobbiHatchingCeremony.onComplete.
   */
  maybeAutoStart: () => void;
}

export function useWelcomeTour(): UseWelcomeTourResult {
  const { user } = useCurrentUser();
  const pubkey = user?.pubkey;
  const [hasSeen, setHasSeen] = useLocalStorage<boolean>(storageKeyFor(pubkey), false);

  const start = useCallback(() => {
    setTourIntent(true);
  }, []);

  const markSeen = useCallback(() => {
    setHasSeen(true);
  }, [setHasSeen]);

  const maybeAutoStart = useCallback(() => {
    if (!pubkey || hasSeen) return;
    setTourIntent(true);
  }, [pubkey, hasSeen]);

  return { hasSeen, start, markSeen, maybeAutoStart };
}

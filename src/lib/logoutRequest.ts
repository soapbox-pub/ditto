import { useSyncExternalStore } from 'react';

/**
 * The one way a "Log out" button removes an account. `LogoutGuard` answers the
 * request: an nsec account is asked to confirm, and one whose key exists
 * nowhere else (`keyBackupPending`) is asked to back it up first. Resolves
 * `true` once the account is removed, `false` if the user backed out.
 */

export interface LogoutRequest {
  /** The login to remove; the active one when omitted. */
  loginId?: string;
  resolve(loggedOut: boolean): void;
}

let current: LogoutRequest | null = null;
const listeners = new Set<() => void>();

function set(next: LogoutRequest | null): void {
  current = next;
  for (const l of listeners) l();
}

export function requestLogout(loginId?: string): Promise<boolean> {
  // A second click while the first is pending answers the first as cancelled.
  current?.resolve(false);
  return new Promise((resolve) => {
    set({
      loginId,
      resolve(loggedOut) {
        set(null);
        resolve(loggedOut);
      },
    });
  });
}

export function useLogoutRequest(): LogoutRequest | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => null,
  );
}

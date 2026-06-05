import { useSyncExternalStore } from 'react';

function subscribe(callback: () => void): () => void {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

function getSnapshot(): boolean {
  // `navigator.onLine` is `false` only when the OS reports no connectivity.
  // `true` does NOT guarantee relays are reachable — treat it as a hint, not
  // a promise. Useful for distinguishing "definitely offline" in the UI.
  return typeof navigator === 'undefined' ? true : navigator.onLine;
}

function getServerSnapshot(): boolean {
  // Assume online when there's no browser environment (SSR / tests without a
  // navigator) so we never render an offline state by default.
  return true;
}

/**
 * Reactive wrapper around `navigator.onLine` + the `online`/`offline` window
 * events. Returns `true` while the browser reports connectivity, `false` when
 * the OS reports the device is offline.
 *
 * Limitation: `navigator.onLine === true` means "the OS has a network route",
 * not "Nostr relays are reachable". Use this to surface a *definitely offline*
 * hint, not as a guarantee that requests will succeed.
 */
export function useIsOnline(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

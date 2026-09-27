/**
 * Whether the app is in the foreground.
 *
 * On native this follows Capacitor's `appStateChange`, which comes from the
 * activity lifecycle: the Android WebView doesn't deliver `visibilitychange`
 * reliably when the app is backgrounded. On the web it's the page's
 * visibility.
 */
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

let nativeActive = true;
let installed = false;
const listeners = new Set<(active: boolean) => void>();

function notify(active: boolean): void {
  for (const listener of [...listeners]) {
    try {
      listener(active);
    } catch {
      // A listener must never break the others.
    }
  }
}

function install(): void {
  if (installed) return;
  installed = true;
  if (Capacitor.isNativePlatform()) {
    void CapacitorApp.getState().then(({ isActive }) => {
      if (isActive === nativeActive) return;
      nativeActive = isActive;
      notify(isActive);
    }).catch(() => {});
    void CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive === nativeActive) return;
      nativeActive = isActive;
      notify(isActive);
    });
  } else if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => notify(isAppActive()));
  }
}

/** Whether the app is in the foreground right now. */
export function isAppActive(): boolean {
  install();
  if (Capacitor.isNativePlatform()) return nativeActive;
  return typeof document === 'undefined' || document.visibilityState !== 'hidden';
}

/** Subscribe to the app moving to the foreground (`true`) or background (`false`). */
export function onAppActiveChange(listener: (active: boolean) => void): () => void {
  install();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

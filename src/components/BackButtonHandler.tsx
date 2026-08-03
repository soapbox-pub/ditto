import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';

/**
 * Handles the Android hardware/gesture back button.
 *
 * Capacitor's default behavior navigates webview history back when possible,
 * but when the history stack is empty it consumes the event and does nothing —
 * so the back gesture on the app's first page appears broken (the app should
 * move to the background, like every other Android app).
 *
 * Registering a `backButton` listener disables Capacitor's default handling
 * entirely, so both branches must be handled here:
 *
 *   - history available → navigate back (same as the default behavior)
 *   - root page         → minimize the app (Android's standard root-back UX;
 *                         `minimizeApp` backgrounds the task instead of
 *                         killing the activity like `exitApp` would, so app
 *                         state survives if the user returns)
 *
 * The `backButton` event only fires on Android — iOS swipe-back is handled
 * natively by WKWebView's navigation gestures.
 */
export function BackButtonHandler() {
  useEffect(() => {
    if (Capacitor.getPlatform() !== 'android') return;

    let cleanup: (() => void) | undefined;

    async function setup() {
      const { App } = await import('@capacitor/app');

      const listener = await App.addListener('backButton', ({ canGoBack }) => {
        if (canGoBack) {
          window.history.back();
        } else {
          App.minimizeApp();
        }
      });

      cleanup = () => listener.remove();
    }

    setup();

    return () => {
      cleanup?.();
    };
  }, []);

  return null;
}

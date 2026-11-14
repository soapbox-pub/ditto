import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';

import { slideNextBack } from '@/lib/pushTransition';

/** A dialog, sheet, popover or menu that's open over the page. */
const OPEN_LAYER = '[data-state="open"]:is([role="dialog"], [role="alertdialog"], [role="menu"])';

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
        // An open sheet, dialog or menu closes first, like a native one: back
        // dismisses what's on top before it leaves the page. Radix layers
        // (and vaul's sheets, built on them) all close on Escape.
        if (document.querySelector(OPEN_LAYER)) {
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
          return;
        }
        if (canGoBack) {
          slideNextBack();
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

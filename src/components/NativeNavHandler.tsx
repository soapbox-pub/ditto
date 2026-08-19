import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor, registerPlugin } from '@capacitor/core';

import type { PluginListenerHandle } from '@capacitor/core';

/**
 * Native navigation events delivered by the custom `DittoNotification` plugin,
 * as opposed to the `appUrlOpen` deep links handled by `DeepLinkHandler`.
 *
 * Two events, both carrying their payload as structured JSON data (never a
 * pre-built JavaScript string):
 *
 *   - `share` — Android share-sheet targets. `mode` selects "View in Ditto"
 *     ("view") vs "Post on Ditto" ("post"); `text` is the raw shared text.
 *   - `notificationTap` — iOS notification taps. `path` is the in-app route to
 *     open. (Android notification taps are `ACTION_VIEW` intents and arrive via
 *     `appUrlOpen`/`DeepLinkHandler` instead.)
 */
interface DittoNotificationEvents {
  addListener(
    eventName: 'share',
    listener: (event: { mode: string; text: string }) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'notificationTap',
    listener: (event: { path: string }) => void,
  ): Promise<PluginListenerHandle>;
}

const DittoNotification = registerPlugin<DittoNotificationEvents>('DittoNotification');

/**
 * A rooted in-app path: starts with a single `/` and contains only the
 * characters RFC 3986 allows in a path, query or fragment. A second leading
 * slash is rejected because `//host` is a protocol-relative URL —
 * `history.pushState` throws on the cross-origin target and React Router's
 * history falls back to `window.location.assign()`, turning the soft
 * navigation into an off-origin navigation attempt. (Backslash is outside the
 * character class, so the `/\` variant is rejected too.) Notification taps
 * only ever target our own routes, so anything else is dropped.
 */
function isSafePath(path: string): boolean {
  return /^\/(?!\/)[A-Za-z0-9\-._~!$&'()*+,;=:@%/?#[\]]*$/.test(path);
}

/**
 * Routes native `DittoNotification` plugin events through React Router.
 *
 * Kept separate from `DeepLinkHandler` (which owns the first-party
 * `@capacitor/app` `appUrlOpen` flow) so the custom-plugin event contract and
 * the first-party deep-link contract stay in independent files. Both perform a
 * soft `navigate()` — no full-document reload, no `evaluateJavascript`.
 *
 * Must be rendered inside a `<BrowserRouter>`.
 */
export function NativeNavHandler() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const handles: PluginListenerHandle[] = [];
    let cancelled = false;

    async function setup() {
      const share = await DittoNotification.addListener('share', ({ mode, text }) => {
        if (!text) return;
        // The text travels as router state, so it is never assembled into a URL
        // or a code string. SharePage reads `location.state` before its query
        // params.
        navigate('/share', {
          state: { mode: mode === 'view' ? 'view' : 'post', text },
        });
      });

      const tap = await DittoNotification.addListener('notificationTap', ({ path }) => {
        if (!path || !isSafePath(path)) return;
        navigate(path);
      });

      if (cancelled) {
        share.remove();
        tap.remove();
        return;
      }
      handles.push(share, tap);
    }

    setup();

    return () => {
      cancelled = true;
      for (const handle of handles) {
        handle.remove();
      }
    };
  }, [navigate]);

  return null;
}

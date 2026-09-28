import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';

import { resolveSchemeUri } from '@/lib/schemeUri';

/**
 * Handles deep links on native platforms.
 *
 * Three flavours are supported:
 *
 *   1. `https://ditto.pub/...` universal links — the path/query/hash is
 *      forwarded verbatim to the in-app router.
  *   2. `bitcoin:...` BIP-21 payment URIs — the user is dropped on the
 *      `/wallet` page with the URI passed through `location.state.bip21Uri`
 *      so the Send dialog auto-opens with the recipient (and amount, when
 *      present) prefilled. `monero:...` URIs work the same way via
 *      `location.state.moneroUri`, additionally switching the page to the
 *      Monero tab.
 *   3. `nostr:...` NIP-21 URIs — the bech32 identifier (npub, nprofile,
 *      note, nevent, naddr) is resolved to its app route and navigated to.
 *
 * Flavours 2 and 3 are resolved by `resolveSchemeUri`, which the web
 * manifest's `protocol_handlers` also reach via `ProtocolHandlerPage`.
 *
 * Must be rendered inside a `<BrowserRouter>`.
 */
export function DeepLinkHandler() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let cleanup: (() => void) | undefined;

    async function setup() {
      const { App } = await import('@capacitor/app');

      // Handle URLs opened while the app is already running
      const listener = await App.addListener('appUrlOpen', (event) => {
        const raw = event.url?.trim();
        if (!raw) return;

        // `bitcoin:`, `monero:`, and `nostr:` URIs.
        if (/^(bitcoin|monero|nostr):/i.test(raw)) {
          const target = resolveSchemeUri(raw);
          if (target) {
            navigate(target.path, { state: target.state });
          }
          return;
        }

        // Universal links only. The path is forwarded to the router verbatim,
        // so restricting it to https keeps arbitrary custom schemes — which
        // any app on the device can register and fire — from picking the route
        // the app lands on. `bitcoin:` and `nostr:` are handled above.
        try {
          const url = new URL(raw);
          if (url.protocol !== 'https:') return;
          // A `//host` pathname (from e.g. `https://ditto.pub//evil.com`,
          // which any app can hand us via an explicit intent — App Link
          // verification doesn't gate those) is a protocol-relative URL:
          // `history.pushState` throws on the cross-origin target and React
          // Router's history falls back to `window.location.assign()`. The
          // URL parser guarantees the pathname is rooted and backslash-free,
          // so rejecting a second leading slash keeps navigation on-origin.
          if (url.pathname.startsWith('//')) return;
          const path = url.pathname + url.search + url.hash;
          if (path) {
            navigate(path);
          }
        } catch {
          // Invalid URL, ignore
        }
      });

      cleanup = () => listener.remove();
    }

    setup();

    return () => {
      cleanup?.();
    };
  }, [navigate]);

  return null;
}

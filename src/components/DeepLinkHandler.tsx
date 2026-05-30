import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';

import { getNostrIdentifierPath } from '@/lib/nostrIdentifier';

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
 *      present) prefilled.
 *   3. `nostr:...` NIP-21 URIs — the bech32 identifier (npub, nprofile,
 *      note, nevent, naddr) is resolved to its app route and navigated to.
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

        // BIP-21 `bitcoin:` URIs — open the wallet's Send dialog prefilled.
        // The scheme check is case-insensitive (BIP-21 doesn't mandate case
        // and some QR encoders uppercase the entire URI).
        if (/^bitcoin:/i.test(raw)) {
          navigate('/wallet', { state: { bip21Uri: raw } });
          return;
        }

        // NIP-21 `nostr:` URIs — resolve the bech32 identifier to its app
        // route and navigate. NIP-21 mandates a lowercase `nostr:` scheme,
        // but some QR encoders uppercase the whole URI, so we match the
        // scheme case-insensitively and normalize it back to lowercase
        // before handing off (the bech32 body is left untouched, since
        // `getNostrIdentifierPath` validates it via `nip19.decode`).
        const nostrScheme = /^nostr:/i.exec(raw);
        if (nostrScheme) {
          const normalized = `nostr:${raw.slice(nostrScheme[0].length)}`;
          const path = getNostrIdentifierPath(normalized);
          if (path) {
            navigate(path);
          }
          return;
        }

        try {
          const url = new URL(raw);
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

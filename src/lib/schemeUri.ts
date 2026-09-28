import { getNostrIdentifierPath } from '@/lib/nostrIdentifier';

/** Where a custom-scheme URI should land inside the app. */
export interface SchemeUriTarget {
  path: string;
  state?: { bip21Uri: string } | { moneroUri: string };
}

/**
 * Resolves a `bitcoin:`, `monero:`, or `nostr:` URI to an in-app route.
 * Shared by native deep links (`DeepLinkHandler`) and the web manifest's
 * `protocol_handlers` (`ProtocolHandlerPage`). Returns `undefined` for any
 * other scheme or an unroutable `nostr:` identifier.
 *
 *   - `bitcoin:` BIP-21 payment URIs open `/wallet` with the URI in
 *     `state.bip21Uri`, so the Send dialog auto-opens prefilled.
 *   - `monero:` URIs do the same via `state.moneroUri`.
 *   - `nostr:` NIP-21 URIs resolve their bech32 identifier to its route.
 *
 * Schemes are matched case-insensitively: BIP-21 doesn't mandate case, and
 * some QR encoders uppercase the entire URI.
 */
export function resolveSchemeUri(raw: string): SchemeUriTarget | undefined {
  const uri = raw.trim();

  if (/^bitcoin:/i.test(uri)) {
    return { path: '/wallet', state: { bip21Uri: uri } };
  }

  if (/^monero:/i.test(uri)) {
    return { path: '/wallet', state: { moneroUri: uri } };
  }

  // NIP-21 mandates a lowercase `nostr:` scheme, so normalize it before
  // handing off. The bech32 body is left untouched, since
  // `getNostrIdentifierPath` validates it via `nip19.decode`.
  const nostrScheme = /^nostr:/i.exec(uri);
  if (nostrScheme) {
    const path = getNostrIdentifierPath(`nostr:${uri.slice(nostrScheme[0].length)}`);
    return path ? { path } : undefined;
  }

  return undefined;
}

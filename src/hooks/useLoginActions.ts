import { BunkerURI, NSecSigner } from '@nostrify/nostrify';
import {
  NLogin,
  type NLoginType,
  type NostrConnectParams,
  type NostrConnectStatus,
  useNostrLogin,
} from '@nostrify/react/login';
import { generateSecretKey, nip19 } from 'nostr-tools';
import { useAppContext } from '@/hooks/useAppContext';
import { APP_RELAYS } from '@/lib/appRelays';
import { AndroidNativeSigner } from '@/lib/androidNativeSigner';
import { getNip07Provider, hasConnect } from '@/lib/nip07';
import { Nip46Signer } from '@/lib/nip46Signer';
import { isNostrId } from '@/lib/nostrId';
import { Nip46Transport } from '@/lib/nip46Transport';
import { normalizeRelayUrl } from '@/lib/relayPolicy';

// NOTE: This file should not be edited except for adding new login methods.

export type { NostrConnectParams, NostrConnectStatus };
export { generateNostrConnectParams, generateNostrConnectURI } from '@nostrify/react/login';

/** Cap on the frozen bunker relay set — pairing URIs plus the bunker's own. */
const MAX_BUNKER_RELAYS = 8;

/** Loopback is unreachable for a remote signer. */
function usableRendezvousRelay(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return !(host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.localhost'));
  } catch {
    return false;
  }
}

/**
 * Merge the bunker's own `get_relays` list (NIP-46) into the frozen pairing set: old
 * bunker:// URIs often carry stale relays. Best-effort; pairing relays stay FIRST.
 */
async function adoptBunkerRelays(signer: Nip46Signer, pairingRelays: string[]): Promise<string[]> {
  let reported: string[];
  try {
    const relays = await Promise.race([
      signer.getRelays(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('get_relays probe timed out')), 10_000),
      ),
    ]);
    reported = Object.entries(relays)
      .filter(([, perm]) => perm?.read || perm?.write)
      .map(([url]) => url);
  } catch {
    return pairingRelays;
  }
  const merged = [...pairingRelays];
  for (const url of reported) {
    const normalized = normalizeRelayUrl(url);
    if (!normalized || !usableRendezvousRelay(normalized) || merged.includes(normalized)) continue;
    merged.push(normalized);
    if (merged.length >= MAX_BUNKER_RELAYS) break;
  }
  return merged;
}

export function useLoginActions() {
  const { logins, addLogin, setLogin, removeLogin } = useNostrLogin();
  const { config } = useAppContext();

  // Add a login and promote it to be the current user. Without the
  // setLogin call the new login is appended to the end of the array,
  // leaving the prior account as logins[0] — which is what
  // useCurrentUser / useLoggedInAccounts treat as the active user.
  // Promoting here makes "Add another account" actually switch.
  const addAndActivate = (login: NLoginType) => {
    addLogin(login);
    setLogin(login.id);
  };

  return {
    // Login with a Nostr secret key
    nsec(nsec: string): void {
      const login = NLogin.fromNsec(nsec);
      addAndActivate(login);
    },
    // Login with a NIP-46 "bunker://" URI. Pairing uses a throwaway
    // Nip46Transport, never the relay pool (which wedges NIP-46 on Android;
    // see nip46Transport.ts). The bunker's relays are then adopted.
    async bunker(uri: string): Promise<void> {
      const { pubkey: bunkerPubkey, secret, relays } = new BunkerURI(uri);
      if (!relays.length) throw new Error('No relay provided');
      const clientSk = generateSecretKey();
      const transport = new Nip46Transport(relays);
      const signer = new Nip46Signer({
        transport,
        bunkerPubkey,
        clientSigner: new NSecSigner(clientSk),
      });
      try {
        await signer.connect(secret);
        const pubkey = await signer.getPublicKey();
        const sessionRelays = await adoptBunkerRelays(signer, relays);
        addAndActivate(
          new NLogin('bunker', pubkey, {
            bunkerPubkey,
            clientNsec: nip19.nsecEncode(clientSk),
            relays: sessionRelays,
          }),
        );
      } finally {
        signer.close();
        transport.close();
      }
    },
    // Login with a NIP-07 browser extension. One that can give the site an
    // account of the user's choosing (connect) is asked for one; the
    // extension shows the account itself.
    async extension(): Promise<void> {
      const provider = getNip07Provider();
      if (hasConnect(provider)) {
        const signer = await provider.connect();
        const answer: unknown = await signer.getPublicKey();
        const pubkey = typeof answer === 'string' ? answer.toLowerCase() : '';
        if (!isNostrId(pubkey)) throw new Error('The extension returned an invalid public key');
        addAndActivate(new NLogin('extension', pubkey, null));
        return;
      }
      const login = await NLogin.fromExtension();
      addAndActivate(login);
    },
    // Login via an installed Android signer app (Amber, etc.) using the
    // capacitor-plugin-nostr-signer plugin. The first getPublicKey() call triggers
    // the signer's consent prompt; we cache the resulting pubkey on the login
    // so we don't re-prompt on every app launch.
    async androidSigner(packageName: string): Promise<void> {
      const signer = new AndroidNativeSigner(packageName);
      const pubkey = await signer.getPublicKey();
      const login = new NLogin('x-android-signer', pubkey, { packageName });
      addLogin(login);
    },
    // Login via nostrconnect:// (client-initiated NIP-46)
    // The client displays a QR code and waits for the remote signer to connect.
    // Same dedicated-transport rule as bunker(): the bunker pubkey is unknown
    // until the ack, so it can't share the session transport.
    //
    // `onStatus` reports live progress through the handshake phases so the UI
    // can render it — see NostrConnectStatus.
    async nostrconnect(
      params: NostrConnectParams,
      signal?: AbortSignal,
      onStatus?: (status: NostrConnectStatus) => void,
    ): Promise<void> {
      const clientSigner = new NSecSigner(params.clientSecretKey);
      const transport = new Nip46Transport(params.relays);
      const effectiveSignal = signal ?? AbortSignal.timeout(120_000);
      let signer: Nip46Signer | undefined;
      try {
        onStatus?.('awaiting-connect');
        const sub = transport.req([{ kinds: [24133], '#p': [params.clientPubkey] }], {
          signal: effectiveSignal,
        });
        for await (const msg of sub) {
          if (msg[0] !== 'EVENT') continue;
          const event = msg[2];
          let response: { result?: unknown };
          try {
            response = JSON.parse(await clientSigner.nip44.decrypt(event.pubkey, event.content));
          } catch {
            continue; // Not addressed to us / undecryptable noise.
          }
          // ONLY the generated secret is accepted: the REQ reveals the client pubkey to every
          // relay, so any of them could win with a bare "ack". (`bunker://` pins the
          // counterparty, so "ack" is fine there.)
          if (response?.result !== params.secret) continue;

          onStatus?.('getting-public-key');
          signer = new Nip46Signer({
            transport,
            bunkerPubkey: event.pubkey,
            clientSigner,
          });
          const userPubkey = await signer.getPublicKey();
          const sessionRelays = await adoptBunkerRelays(signer, params.relays);
          addAndActivate(
            new NLogin('bunker', userPubkey, {
              bunkerPubkey: event.pubkey,
              clientNsec: nip19.nsecEncode(params.clientSecretKey),
              relays: sessionRelays,
            }),
          );
          return;
        }
        // Ended without a response: aborted or timed out.
        if (signal?.aborted) {
          const err = new Error('The nostrconnect handshake was aborted');
          err.name = 'AbortError';
          throw err;
        }
        throw new Error('Timeout waiting for remote signer');
      } finally {
        signer?.close();
        transport.close();
      }
    },
    // Get the relay URLs for NIP-46 nostrconnect communication
    getRelayUrls(): string[] {
      const relays = config.relayMetadata.relays
        .filter((r) => r.write)
        .map((r) => r.url);
      // Fall back to the app default relays if the user has none configured
      return relays.length > 0
        ? relays
        : APP_RELAYS.relays.filter((r) => r.write).map((r) => r.url);
    },
    // Log out the current user
    async logout(): Promise<void> {
      const login = logins[0];
      if (login) {
        removeLogin(login.id);
      }
    }
  };
}

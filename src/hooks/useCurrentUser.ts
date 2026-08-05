import { useNostr } from '@nostrify/react';
import { type NLoginType, NUser, useNostrLogin } from '@nostrify/react/login';
import { NRelay1, NSecSigner } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';
import { useCallback, useMemo, useSyncExternalStore } from 'react';

import { useAuthor } from './useAuthor.ts';
import { devSignupPubkey, subscribeDevSignup } from '@/dev/devSignupArrival';
import { createDevSignupUser } from '@/dev/devSignupUser';
import { signerWithNudge } from '@/lib/signerWithNudge';
import { NSecSignerBtc, NBrowserSignerBtc, NConnectSignerBtc } from '@/lib/bitcoin-signers';
import { AndroidNativeSigner } from '@/lib/androidNativeSigner';

export function useCurrentUser() {
  const { nostr } = useNostr();
  const { logins } = useNostrLogin();

  // Localhost-only: the signup→arrival simulation shadows the current account
  // so the arrival lifecycle sees a pubkey resolve *before* signup completes,
  // which is the ordering that broke the real integration. It never touches
  // `logins`, so the real account list is untouched and is restored the moment
  // the simulation ends. `devSignupPubkey()` returns undefined in production
  // builds and off localhost, so this collapses to the real path.
  const devPubkey = useSyncExternalStore(subscribeDevSignup, devSignupPubkey);

  const loginToUser = useCallback((login: NLoginType): NUser  => {
    let user: NUser;
    let isBunkerConnected: (() => boolean) | undefined;

    switch (login.type) {
      case 'nsec': { // Nostr login with secret key — use BTC-extended signer
        const sk = nip19.decode(login.data.nsec) as { type: 'nsec'; data: Uint8Array };
        user = new NUser(login.type, login.pubkey, new NSecSignerBtc(sk.data));
        break;
      }
      case 'bunker': { // Nostr login with NIP-46 "bunker://" URI — use BTC-extended signer
        const clientSk = nip19.decode(login.data.clientNsec) as { type: 'nsec'; data: Uint8Array };
        const clientSigner = new NSecSigner(clientSk.data);
        const bunkerRelays = login.data.relays;

        user = new NUser(
          login.type,
          login.pubkey,
          new NConnectSignerBtc({
            relay: nostr.group(bunkerRelays),
            pubkey: login.data.bunkerPubkey,
            signer: clientSigner,
            timeout: 60_000,
          }),
        );

        // Called at nudge time to check whether any of the bunker's relay
        // WebSockets are OPEN. Relay instances are shared with the main pool
        // so pool.relays will contain them once they have been opened.
        isBunkerConnected = () => bunkerRelays.some((url) => {
          const relay = nostr.relay(url);
          return relay instanceof NRelay1 && relay.socket.readyState === WebSocket.OPEN;
        });
        break;
      }
      case 'extension': // Nostr login with NIP-07 browser extension — use BTC-extended signer
        user = new NUser(login.type, login.pubkey, new NBrowserSignerBtc());
        break;
      case 'x-android-signer': { // Native Android signer app (Amber, etc.) via capacitor-plugin-nostr-signer
        const { packageName } = login.data as { packageName: string };
        user = new NUser(login.type, login.pubkey, new AndroidNativeSigner(packageName, login.pubkey));
        break;
      }
      // Other login types can be defined here
      default:
        throw new Error(`Unsupported login type: ${login.type}`);
    }
    return new NUser(user.method, user.pubkey, signerWithNudge(user.signer, isBunkerConnected));
  }, [nostr]);

  const users = useMemo(() => {
    const users: NUser[] = [];

    for (const login of logins) {
      try {
        const user = loginToUser(login);
        users.push(user);
      } catch (error) {
        console.warn("Skipped invalid login", login.id, error);
      }
    }

    return users;
  }, [logins, loginToUser]);

  const user = (devPubkey
    ? (createDevSignupUser() as unknown as NUser)
    : users[0]) as NUser | undefined;

  // The current user's kind 0 profile is served from useAuthor, which
  // may resolve instantly if pre-cached by useFeed. Otherwise it fetches
  // from relays in the background.
  // The simulated account has no profile to fetch, and asking would be a relay
  // query the tool promises not to make.
  const author = useAuthor(devPubkey ? undefined : user?.pubkey);

  return {
    user,
    users,
    ...author.data,
    isLoading: author.isLoading,
  };
}

import { useNostr } from '@nostrify/react';
import { type NLoginType, NUser, useNostrLogin } from '@nostrify/react/login';
import { NSecSigner } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';
import { useCallback, useMemo } from 'react';

import { useAuthor } from './useAuthor.ts';
import { signerWithNudge } from '@/lib/signerWithNudge';
import { NSecSignerBtc, NBrowserSignerBtc } from '@/lib/bitcoin-signers';
import { AndroidNativeSigner } from '@/lib/androidNativeSigner';
import { NIP46_SIGN_TIMEOUT_MS, Nip46Signer } from '@/lib/nip46Signer';
import { getNip46Transport } from '@/lib/nip46Transport';

/**
 * ONE NUser (and signer) per (nostr instance, login id), app-wide. Per-call-site
 * construction would give NIP-46 logins N signers with duplicate bunker
 * subscriptions. Weakly keyed by the nostr instance so a provider remount
 * invalidates it.
 */
const userCache = new WeakMap<object, Map<string, NUser>>();

export function useCurrentUser() {
  const { nostr } = useNostr();
  const { logins } = useNostrLogin();

  const loginToUser = useCallback((login: NLoginType): NUser  => {
    let byLogin = userCache.get(nostr);
    if (!byLogin) {
      byLogin = new Map();
      userCache.set(nostr, byLogin);
    }
    const existing = byLogin.get(login.id);
    if (existing) return existing;

    let user: NUser;
    let isBunkerConnected: (() => boolean) | undefined;
    let nudgeOpts: Parameters<typeof signerWithNudge>[2];

    switch (login.type) {
      case 'nsec': { // Nostr login with secret key — use BTC-extended signer
        const sk = nip19.decode(login.data.nsec) as { type: 'nsec'; data: Uint8Array };
        user = new NUser(login.type, login.pubkey, new NSecSignerBtc(sk.data));
        break;
      }
      case 'bunker': { // Nostr login with NIP-46 "bunker://" URI
        const clientSk = nip19.decode(login.data.clientNsec) as { type: 'nsec'; data: Uint8Array };
        const bunkerRelays = login.data.relays;

        // A dedicated plain-WebSocket transport, never the relay pool (which
        // wedges NIP-46 on Android; see nip46Transport.ts).
        const transport = getNip46Transport(login.data.bunkerPubkey, bunkerRelays);

        user = new NUser(
          login.type,
          login.pubkey,
          new Nip46Signer({
            transport,
            bunkerPubkey: login.data.bunkerPubkey,
            clientSigner: new NSecSigner(clientSk.data),
          }),
        );

        // Lets the nudge say "signer relay unreachable" when all bunker sockets are down.
        isBunkerConnected = () => transport.isConnected();
        // A signature may wait on the user approving it in the signer app.
        nudgeOpts = { remote: true, signerRelays: bunkerRelays, hardTimeoutMs: NIP46_SIGN_TIMEOUT_MS + 10_000 };
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
    const wrapped = new NUser(user.method, user.pubkey, signerWithNudge(user.signer, isBunkerConnected, nudgeOpts));
    byLogin.set(login.id, wrapped);
    return wrapped;
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

  const user = users[0] as NUser | undefined;

  // No profile read here: this is called by several components in every feed
  // row, and each useAuthor call is a query observer plus a local-store read
  // on mount. Callers that need the kind 0 use useCurrentUserProfile.
  return { user, users };
}

/** The current user plus their kind 0 profile. */
export function useCurrentUserProfile() {
  const { user, users } = useCurrentUser();

  // Served from useAuthor, which may resolve instantly if pre-cached by
  // useFeed. Otherwise it fetches from relays in the background.
  const author = useAuthor(user?.pubkey);

  return {
    user,
    users,
    ...author.data,
    isLoading: author.isLoading,
  };
}

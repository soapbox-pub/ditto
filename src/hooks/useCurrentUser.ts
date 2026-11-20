import { useNostr } from '@nostrify/react';
import { type NLoginType, NUser, useNostrLogin } from '@nostrify/react/login';
import { nip19 } from 'nostr-tools';
import { useCallback, useMemo } from 'react';

import { useAuthor } from './useAuthor.ts';
import { signerWithNudge } from '@/lib/signerWithNudge';
import { NSecSignerBtc, NBrowserSignerBtc } from '@/lib/bitcoin-signers';
import { AndroidNativeSigner } from '@/lib/androidNativeSigner';
import { getNip46SessionSigner, NIP46_SIGN_TIMEOUT_MS } from '@/lib/nip46Signer';
import { getNip46Transport } from '@/lib/nip46Transport';
import { signerWithPow } from '@/lib/pow';

/**
 * ONE NUser per (nostr instance, login id), app-wide, rebuilt when the login
 * itself is replaced. Weakly keyed by the nostr instance so a provider remount
 * invalidates it. A NIP-46 login's signer is shared beyond this too (see
 * getNip46SessionSigner).
 */
const userCache = new WeakMap<object, Map<string, { login: NLoginType; user: NUser }>>();

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
    if (existing?.login === login) return existing.user;

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
        const bunkerRelays = login.data.relays ?? [];

        // A dedicated plain-WebSocket transport, never the relay pool (which
        // wedges NIP-46 on Android; see nip46Transport.ts).
        const transport = getNip46Transport(login.data.bunkerPubkey, bunkerRelays);

        // The login's one signer, shared with NostrProvider's AUTH signer.
        user = new NUser(
          login.type,
          login.pubkey,
          getNip46SessionSigner({
            id: login.id,
            bunkerPubkey: login.data.bunkerPubkey,
            clientNsec: login.data.clientNsec,
            relays: bunkerRelays,
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
    // Mined outside the nudge, so the time spent mining never reads as a stalled signer.
    const signer = signerWithPow(signerWithNudge(user.signer, isBunkerConnected, nudgeOpts), login.pubkey);
    const wrapped = new NUser(user.method, user.pubkey, signer);
    byLogin.set(login.id, { login, user: wrapped });
    return wrapped;
  }, [nostr]);

  const users = useMemo(() => {
    const users: NUser[] = [];

    // A removed login's user would otherwise be kept, its signer closed, for the session.
    const ids = new Set(logins.map((login) => login.id));
    const byLogin = userCache.get(nostr);
    for (const id of byLogin?.keys() ?? []) {
      if (!ids.has(id)) byLogin!.delete(id);
    }

    for (const login of logins) {
      try {
        const user = loginToUser(login);
        users.push(user);
      } catch (error) {
        console.warn("Skipped invalid login", login.id, error);
      }
    }

    return users;
  }, [logins, loginToUser, nostr]);

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

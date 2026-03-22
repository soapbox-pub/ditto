import { type NLoginType, NUser, useNostrLogin } from '@nostrify/react/login';
import { useNostr } from '@nostrify/react';
import { NConnectSigner, NSecSigner } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';
import { useCallback, useMemo } from 'react';

import { useAuthor } from './useAuthor.ts';

export function useCurrentUser() {
  const { nostr } = useNostr();
  const { logins } = useNostrLogin();

  const loginToUser = useCallback((login: NLoginType): NUser  => {
    switch (login.type) {
      case 'nsec': // Nostr login with secret key
        return NUser.fromNsecLogin(login);
      case 'bunker': {
        // Workaround for upstream bug in NUser.fromBunkerLogin():
        // It passes `login.pubkey` (user pubkey) to NConnectSigner instead of
        // `login.data.bunkerPubkey`. For signers where these differ (e.g. Primal
        // Signer), all signing requests fail after page reload because the
        // NConnectSigner encrypts requests to the wrong pubkey.
        const clientSk = nip19.decode(login.data.clientNsec) as {
          type: 'nsec';
          data: Uint8Array;
        };
        const clientSigner = new NSecSigner(clientSk.data);

        return new NUser(
          login.type,
          login.pubkey,
          new NConnectSigner({
            relay: nostr.group(login.data.relays),
            pubkey: login.data.bunkerPubkey, // FIX: use bunker pubkey, not user pubkey
            signer: clientSigner,
            timeout: 60_000,
          }),
        );
      }
      case 'extension': // Nostr login with NIP-07 browser extension
        return NUser.fromExtensionLogin(login);
      // Other login types can be defined here
      default:
        throw new Error(`Unsupported login type: ${login.type}`);
    }
  }, [nostr]);

  const users = useMemo(() => {
    const users: NUser[] = [];

    for (const login of logins) {
      try {
        const user = loginToUser(login);
        users.push(user);
      } catch (error) {
        console.warn('Skipped invalid login', login.id, error);
      }
    }

    return users;
  }, [logins, loginToUser]);

  const user = users[0] as NUser | undefined;

  // The current user's kind 0 profile is served from useAuthor, which
  // may resolve instantly if pre-cached by useFeed. Otherwise it fetches
  // from relays in the background.
  const author = useAuthor(user?.pubkey);

  return {
    user,
    users,
    ...author.data,
    isLoading: author.isLoading,
  };
}

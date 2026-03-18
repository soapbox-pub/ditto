import { type NLoginBunker, type NLoginType, NUser, useNostrLogin } from '@nostrify/react/login';
import { useNostr } from '@nostrify/react';
import { NRelay1 } from '@nostrify/nostrify';
import { useCallback, useMemo } from 'react';

import { useAuthor } from './useAuthor.ts';
import { signerWithNudge } from '@/lib/signerWithNudge';

export function useCurrentUser() {
  const { nostr } = useNostr();
  const { logins } = useNostrLogin();

  const loginToUser = useCallback((login: NLoginType): NUser  => {
    let user: NUser;
    let isBunkerConnected: (() => boolean) | undefined;

    switch (login.type) {
      case 'nsec': // Nostr login with secret key
        user = NUser.fromNsecLogin(login);
        break;
      case 'bunker': { // Nostr login with NIP-46 "bunker://" URI
        user = NUser.fromBunkerLogin(login, nostr);
        // Called at nudge time to check whether any of the bunker's relay
        // WebSockets are OPEN. Relay instances are shared with the main pool
        // so pool.relays will contain them once they have been opened.
        const bunkerRelays = (login as NLoginBunker).data.relays;
        isBunkerConnected = () => bunkerRelays.some((url) => {
          const relay = nostr.relay(url);
          return relay instanceof NRelay1 && relay.socket.readyState === WebSocket.OPEN;
        });
        break;
      }
      case 'extension': // Nostr login with NIP-07 browser extension
        user = NUser.fromExtensionLogin(login);
        break;
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

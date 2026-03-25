import { useNostr } from '@nostrify/react';
import { NLogin, type NostrConnectParams, useNostrLogin } from '@nostrify/react/login';
import { useAppContext } from '@/hooks/useAppContext';
import { DITTO_RELAY } from '@/lib/appRelays';

// NOTE: This file should not be edited except for adding new login methods.

export type { NostrConnectParams };
export { generateNostrConnectParams, generateNostrConnectURI } from '@nostrify/react/login';

export function useLoginActions() {
  const { nostr } = useNostr();
  const { logins, addLogin, removeLogin } = useNostrLogin();
  const { config } = useAppContext();

  return {
    // Login with a Nostr secret key
    nsec(nsec: string): void {
      const login = NLogin.fromNsec(nsec);
      addLogin(login);
    },
    // Login with a NIP-46 "bunker://" URI
    async bunker(uri: string): Promise<void> {
      const login = await NLogin.fromBunker(uri, nostr);
      addLogin(login);
    },
    // Login with a NIP-07 browser extension
    async extension(): Promise<void> {
      const login = await NLogin.fromExtension();
      addLogin(login);
    },
    // Login via nostrconnect:// (client-initiated NIP-46)
    // The client displays a QR code and waits for the remote signer to connect
    async nostrconnect(params: NostrConnectParams, signal?: AbortSignal): Promise<void> {
      const login = await NLogin.fromNostrConnect(params, nostr, { signal });
      addLogin(login);
    },
    // Get the relay URLs for NIP-46 nostrconnect communication
    getRelayUrls(): string[] {
      const relays = config.relayMetadata.relays
        .filter((r) => r.write)
        .map((r) => r.url);
      // Fall back to a sensible default if no write relays are configured
      return relays.length > 0 ? relays : [DITTO_RELAY];
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

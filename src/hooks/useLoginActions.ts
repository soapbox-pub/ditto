import { NConnectSigner, NSecSigner } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { NLogin, useNostrLogin } from '@nostrify/react/login';
import { generateSecretKey, getPublicKey } from 'nostr-tools';
import { nip19 } from 'nostr-tools';



// NOTE: This file should not be edited except for adding new login methods.

/** Check if running on actual mobile device (not just small screen) */
function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/** Parameters for initiating a nostrconnect:// session */
export interface NostrConnectParams {
  clientSecretKey: Uint8Array;
  clientPubkey: string;
  secret: string;
  relays: string[];
}

/** Generates a nostrconnect:// URI for QR code display */
export function generateNostrConnectURI(params: NostrConnectParams, appName?: string): string {
  const searchParams = new URLSearchParams();

  for (const relay of params.relays) {
    searchParams.append('relay', relay);
  }
  searchParams.set('secret', params.secret);

  if (appName) {
    searchParams.set('name', appName);
  }

  // Add callback URL only on mobile devices (not desktop QR code scanning)
  // When scanning QR from desktop, the signer app is on the phone but the session is on desktop
  if (typeof window !== 'undefined' && isMobileDevice()) {
    searchParams.set('callback', `${window.location.origin}/remoteloginsuccess`);
  }

  return `nostrconnect://${params.clientPubkey}?${searchParams.toString()}`;
}

/** Generates random parameters for a nostrconnect session */
export function generateNostrConnectParams(relays: string[]): NostrConnectParams {
  const clientSecretKey = generateSecretKey();
  const clientPubkey = getPublicKey(clientSecretKey);
  
  // Generate a random 8-character secret using crypto.getRandomValues
  // This is more compatible than crypto.randomUUID()
  const randomBytes = new Uint8Array(4);
  crypto.getRandomValues(randomBytes);
  const secret = Array.from(randomBytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  return {
    clientSecretKey,
    clientPubkey,
    secret,
    relays,
  };
}

export function useLoginActions() {
  const { nostr } = useNostr();
  const { logins, addLogin, removeLogin } = useNostrLogin();

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
    async nostrconnect(params: NostrConnectParams): Promise<void> {
      const clientSigner = new NSecSigner(params.clientSecretKey);
      const clientPubkey = getPublicKey(params.clientSecretKey);

      // Create a relay group for the connection
      const relayGroup = nostr.group(params.relays);

      // Wait for the connect response from the remote signer
      // We subscribe to kind 24133 events p-tagged to our client pubkey
      const signal = AbortSignal.timeout(120_000); // 2 minute timeout

      const sub = relayGroup.req(
        [{ kinds: [24133], '#p': [clientPubkey], limit: 1 }],
        { signal }
      );

      for await (const msg of sub) {
        if (msg[0] === 'CLOSED') {
          throw new Error('Connection closed before remote signer responded');
        }
        if (msg[0] === 'EVENT') {
          const event = msg[2];

          // Decrypt the response
          const decrypted = await clientSigner.nip44!.decrypt(event.pubkey, event.content);
          const response = JSON.parse(decrypted);

          // Validate the secret matches
          if (response.result !== params.secret && response.result !== 'ack') {
            continue; // Not our response, keep waiting
          }

          // Success! The remote signer has connected
          // Now create the NConnectSigner for ongoing use
          const bunkerPubkey = event.pubkey;

          const signer = new NConnectSigner({
            relay: relayGroup,
            pubkey: bunkerPubkey,
            signer: clientSigner,
            timeout: 60_000,
          });

          // Get the actual user pubkey
          const userPubkey = await signer.getPublicKey();

          // Create and add the login
          const login = new NLogin('bunker', userPubkey, {
            bunkerPubkey,
            clientNsec: nip19.nsecEncode(params.clientSecretKey),
            relays: params.relays,
          });

          addLogin(login);
          return;
        }
      }

      throw new Error('Timeout waiting for remote signer');
    },
    // Get the relay URL for NIP-46 nostrconnect communication
    getRelayUrl(): string {
      return 'wss://relay.damus.io';
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

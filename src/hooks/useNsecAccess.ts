import { useMemo } from 'react';
import { useNostrLogin } from '@nostrify/react/login';
import { nip19 } from 'nostr-tools';

/**
 * Hook that checks whether the current login is an nsec and, if so, provides
 * a function to retrieve the raw 32-byte private key as a hex string.
 *
 * Only nsec logins expose the raw secret key — extension and bunker logins
 * do not, so Bitcoin transaction signing is only possible with nsec.
 */
export function useNsecAccess() {
  const { logins } = useNostrLogin();
  const currentLogin = logins[0];

  const hasNsecAccess = currentLogin?.type === 'nsec';

  const getPrivateKeyHex = useMemo(() => {
    return (): string | null => {
      if (currentLogin?.type !== 'nsec') return null;

      try {
        const decoded = nip19.decode(currentLogin.data.nsec);
        if (decoded.type !== 'nsec') return null;

        // decoded.data is a Uint8Array for nsec
        return Buffer.from(decoded.data).toString('hex');
      } catch (error) {
        console.error('Failed to decode nsec:', error);
        return null;
      }
    };
  }, [currentLogin]);

  return {
    /** Whether the current login exposes the raw private key. */
    hasNsecAccess,
    /** Retrieve the 32-byte private key as hex. Returns null if not an nsec login. */
    getPrivateKeyHex,
    /** The login type of the current user (nsec, bunker, extension, etc.). */
    loginType: currentLogin?.type,
  };
}

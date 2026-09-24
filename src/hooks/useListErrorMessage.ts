import { useCallback } from 'react';
import { useIntl } from 'react-intl';

import { ListEncryptionUnsupportedError, UnreadableListError } from '@/lib/nip51List';

/**
 * Describe an error from editing a NIP-51 list for a toast. The known list
 * errors get a translated message; anything else falls back to its own
 * message, or `fallback`.
 */
export function useListErrorMessage() {
  const intl = useIntl();
  return useCallback((error: unknown, fallback?: string): string | undefined => {
    if (error instanceof UnreadableListError) {
      return intl.formatMessage({
        id: 'lists.unreadable',
        defaultMessage: "Couldn't read the private part of this list. Try again once your signer can decrypt it.",
      });
    }
    if (error instanceof ListEncryptionUnsupportedError) {
      return intl.formatMessage({
        id: 'lists.encryptionUnsupported',
        defaultMessage: 'Your signer cannot encrypt private list entries (NIP-44).',
      });
    }
    return error instanceof Error ? error.message : fallback;
  }, [intl]);
}

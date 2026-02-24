import { NIP05 } from '@nostrify/nostrify';
import { useQuery } from '@tanstack/react-query';

/**
 * Verifies a NIP-05 identifier by fetching the domain's .well-known/nostr.json
 * and confirming the resolved pubkey matches the expected pubkey.
 *
 * Returns `true` only when the NIP-05 identifier has been successfully verified
 * for the given pubkey. Returns `false` if verification fails or is pending.
 */
export function useNip05Verify(nip05: string | undefined, pubkey: string | undefined) {
  return useQuery<boolean>({
    queryKey: ['nip05-verify', nip05, pubkey],
    queryFn: async ({ signal }) => {
      if (!nip05 || !pubkey) return false;

      try {
        const pointer = await NIP05.lookup(nip05, { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) });
        return pointer.pubkey === pubkey;
      } catch {
        return false;
      }
    },
    enabled: !!nip05 && !!pubkey,
    staleTime: 60 * 60 * 1000,  // 1 hour — NIP-05 records rarely change
    gcTime: 2 * 60 * 60 * 1000, // 2 hours
    retry: 1,
  });
}

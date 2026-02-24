import { useNip05Resolve } from '@/hooks/useNip05Resolve';

/**
 * Verifies a NIP-05 identifier against an expected pubkey.
 *
 * Delegates to useNip05Resolve so both hooks share the same TanStack Query
 * cache entry — one network request serves verification and resolution.
 *
 * Returns `true` only when the identifier resolves to exactly the expected
 * pubkey. Returns `false` while pending or if verification fails.
 */
export function useNip05Verify(nip05: string | undefined, pubkey: string | undefined) {
  const { data: resolvedPubkey, ...rest } = useNip05Resolve(nip05);
  return {
    ...rest,
    data: !!resolvedPubkey && !!pubkey && resolvedPubkey === pubkey,
  };
}

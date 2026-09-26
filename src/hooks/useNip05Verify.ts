import { useNip05Resolve } from '@/hooks/useNip05Resolve';

/**
 * Verifies a NIP-05 identifier against an expected pubkey.
 *
 * Delegates to useNip05Resolve so both hooks share the same TanStack Query
 * cache entry — one network request serves verification and resolution.
 *
 * Returns `true` only when the identifier resolves to exactly the expected
 * pubkey. Returns `false` while pending or if verification fails.
 *
 * Reads only `data` and `isPending` off the query result: TanStack Query tracks
 * which fields a component reads and re-renders it only when those change, and
 * spreading the result reads all of them — so every caller (three per NoteCard)
 * re-rendered on each fetchStatus / failureCount flip.
 */
export function useNip05Verify(nip05: string | undefined, pubkey: string | undefined) {
  const query = useNip05Resolve(nip05);
  const resolvedPubkey = query.data;
  return {
    data: !!resolvedPubkey && !!pubkey && resolvedPubkey === pubkey,
    isPending: query.isPending,
  };
}

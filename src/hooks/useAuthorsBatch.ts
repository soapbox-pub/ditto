import { useAuthors } from './useAuthors';

/**
 * Batch fetch author profiles for DM messaging integration.
 * 
 * This hook wraps useAuthors to match the interface expected by
 * @samthomson/nostr-messaging's DMProvider.
 * 
 * @param pubkeys - Array of pubkeys to fetch profiles for
 * @returns Query result with map of pubkey -> AuthorData
 */
export function useAuthorsBatch(pubkeys: string[]) {
  return useAuthors(pubkeys);
}

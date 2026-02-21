import { useAuthors } from '@/hooks/useAuthors';
import { useFollowList } from '@/hooks/useFollowActions';
import type { SearchProfile } from '@/hooks/useSearchProfiles';

/**
 * Returns cached profile metadata for all users the current user follows.
 * This enables client-side search matching against the follow list
 * so autocomplete can prioritize followed profiles.
 */
export function useFollowedProfiles() {
  const { data: followList } = useFollowList();
  const pubkeys = followList?.pubkeys ?? [];

  const { data: authorsMap } = useAuthors(pubkeys);

  // Build SearchProfile[] from the authors map for profiles that have metadata
  const profiles: SearchProfile[] = [];

  if (authorsMap) {
    for (const [, author] of authorsMap) {
      if (author.event && author.metadata) {
        profiles.push({
          pubkey: author.pubkey,
          metadata: author.metadata,
          event: author.event,
        });
      }
    }
  }

  return { profiles, pubkeys: new Set(pubkeys) };
}

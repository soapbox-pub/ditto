import { useMemo } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useFollowList } from '@/hooks/useFollowActions';
import { useNostrStorage } from '@/hooks/useNostrStorage';
import { findUnknownAuthors } from '@/lib/unknownAuthors';

const NONE: ReadonlySet<string> = new Set();

/**
 * Which of `pubkeys` the reader has no reason to know: no profile, and nobody
 * they follow follows them (see {@link findUnknownAuthors}). The reader and
 * their follows are never in it. Empty until it has been worked out, so rows
 * show first and fold once it's known.
 */
export function useUnknownAuthors(pubkeys: readonly string[]): ReadonlySet<string> {
  const { nostr } = useNostr();
  const queryClient = useQueryClient();
  const { store } = useNostrStorage();
  const { user } = useCurrentUser();
  const { data: followList } = useFollowList();
  const follows = followList?.pubkeys;

  const strangers = useMemo(() => {
    const followSet = new Set(follows ?? []);
    return [...new Set(pubkeys)]
      .filter((pk) => pk !== user?.pubkey && !followSet.has(pk))
      .sort();
  }, [pubkeys, follows, user?.pubkey]);

  const { data } = useQuery({
    queryKey: ['unknown-authors', user?.pubkey ?? '', strangers.join(',')],
    queryFn: ({ signal }) => findUnknownAuthors(nostr, queryClient, store, strangers, follows ?? [], signal),
    enabled: strangers.length > 0 && followList !== undefined,
    staleTime: 5 * 60 * 1000,
    placeholderData: (prev) => prev,
  });

  return data ?? NONE;
}

import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import {
  QUIZ_RESULT_KIND,
  isValidQuizResult,
  latestResultPerPubkey,
  parseQuizAddress,
} from '@/lib/quiz';

import type { NostrEvent } from '@nostrify/nostrify';

/**
 * Fetch published results for a quiz (kind 7849 events referencing the quiz
 * coordinate). Returns the newest result per pubkey, newest-first.
 *
 * No `authors` filter on purpose: quiz results are public UGC — anyone may
 * take any quiz. Friend/other partitioning happens in the UI layer.
 */
export function useQuizResults(address: string | undefined) {
  const { nostr } = useNostr();

  // Validate the coordinate (it embeds a pubkey) before it reaches a filter.
  const addr = parseQuizAddress(address);

  return useQuery<NostrEvent[]>({
    queryKey: ['quiz-results', address ?? ''],
    queryFn: async (c) => {
      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(5000)]);
      const events = await nostr.query(
        [{ kinds: [QUIZ_RESULT_KIND], '#a': [address!], limit: 100 }],
        { signal },
      );
      return latestResultPerPubkey(events.filter(isValidQuizResult));
    },
    enabled: !!address && !!addr,
    staleTime: 60 * 1000,
  });
}

/** The logged-in user's newest result for a quiz, or `null`. */
export function useMyQuizResult(address: string | undefined) {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();

  const addr = parseQuizAddress(address);

  return useQuery<NostrEvent | null>({
    queryKey: ['quiz-my-result', address ?? '', user?.pubkey ?? ''],
    queryFn: async (c) => {
      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(5000)]);
      const events = await nostr.query(
        [{ kinds: [QUIZ_RESULT_KIND], '#a': [address!], authors: [user!.pubkey], limit: 10 }],
        { signal },
      );
      return latestResultPerPubkey(events.filter(isValidQuizResult))[0] ?? null;
    },
    enabled: !!address && !!addr && !!user,
    staleTime: 60 * 1000,
  });
}

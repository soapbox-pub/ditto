import { useMemo } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';
import { useCurrentUser } from './useCurrentUser';
import {
  LETTER_KIND,
  type Letter,
  type LetterContent,
  type Stationery,
} from '@/lib/letterTypes';

const PAGE_SIZE = 50;
const EMPTY_DELETED = new Set<string>();

/** Parse a letter event into a Letter object (without decrypting).
 *  All presentation data (stationery, frame, font) is inside the
 *  encrypted content and populated later by useDecryptLetter. */
function parseLetterEvent(event: NostrEvent): Letter | null {
  if (event.kind !== LETTER_KIND) return null;

  const recipient = event.tags.find(([name]) => name === 'p')?.[1];
  if (!recipient) return null;

  return {
    event,
    recipient,
    sender: event.pubkey,
    decrypted: false,
    timestamp: event.created_at,
  };
}

/** Collect event IDs targeted by the user's kind 5 deletion requests. */
function getDeletedIds(deletionEvents: NostrEvent[]): Set<string> {
  const ids = new Set<string>();
  for (const event of deletionEvents) {
    for (const [name, value] of event.tags) {
      if (name === 'e' && value) ids.add(value);
    }
  }
  return ids;
}

/** Fetch inbox letters (letters sent to the current user) with cursor-based pagination.
 *  When `friendPubkeys` is provided, only letters from those pubkeys are returned. */
export function useInbox(friendPubkeys?: string[]) {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();

  // Fetch all deletion IDs once (not paginated — deletion events are small)
  const deletionsQuery = useQuery({
    queryKey: ['letters-deletions', user?.pubkey],
    queryFn: async () => {
      if (!user) return new Set<string>();
      const deletions = await nostr.query([{ kinds: [5], authors: [user.pubkey], '#k': [String(LETTER_KIND)], limit: 500 }]);
      return getDeletedIds(deletions);
    },
    enabled: !!user,
  });
  const deletedIds = deletionsQuery.data ?? EMPTY_DELETED;

  const infiniteQuery = useInfiniteQuery({
    queryKey: ['letters-inbox', user?.pubkey, friendPubkeys ?? null],
    queryFn: async ({ pageParam }: { pageParam: number | undefined }) => {
      if (!user) return [];

      const filter: NostrFilter = {
        kinds: [LETTER_KIND],
        '#p': [user.pubkey],
        limit: PAGE_SIZE,
      };
      if (pageParam) filter.until = pageParam;
      if (friendPubkeys) {
        if (friendPubkeys.length === 0) return [];
        filter.authors = friendPubkeys;
      }

      const events = await nostr.query([filter]);
      return events
        .map(parseLetterEvent)
        .filter((l): l is Letter => l !== null)
        .sort((a, b) => b.timestamp - a.timestamp);
    },
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) => {
      if (lastPage.length < PAGE_SIZE) return undefined;
      const oldest = lastPage[lastPage.length - 1];
      return oldest ? oldest.timestamp : undefined;
    },
    enabled: !!user,
  });

  // Flatten pages and filter out deleted letters
  const data = useMemo(() => {
    if (!infiniteQuery.data) return undefined;
    return infiniteQuery.data.pages
      .flat()
      .filter((l) => !deletedIds.has(l.event.id));
  }, [infiniteQuery.data, deletedIds]);

  return {
    data,
    isLoading: infiniteQuery.isLoading,
    fetchNextPage: infiniteQuery.fetchNextPage,
    hasNextPage: infiniteQuery.hasNextPage,
    isFetchingNextPage: infiniteQuery.isFetchingNextPage,
  };
}

/** Fetch sent letters (letters authored by the current user) with cursor-based pagination. */
export function useSentLetters() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();

  // Reuse the same deletion query (keyed by pubkey, shared across inbox/sent)
  const deletionsQuery = useQuery({
    queryKey: ['letters-deletions', user?.pubkey],
    queryFn: async () => {
      if (!user) return new Set<string>();
      const deletions = await nostr.query([{ kinds: [5], authors: [user.pubkey], '#k': [String(LETTER_KIND)], limit: 500 }]);
      return getDeletedIds(deletions);
    },
    enabled: !!user,
  });
  const deletedIds = deletionsQuery.data ?? EMPTY_DELETED;

  const infiniteQuery = useInfiniteQuery({
    queryKey: ['letters-sent', user?.pubkey],
    queryFn: async ({ pageParam }: { pageParam: number | undefined }) => {
      if (!user) return [];

      const filter: NostrFilter = {
        kinds: [LETTER_KIND],
        authors: [user.pubkey],
        limit: PAGE_SIZE,
      };
      if (pageParam) filter.until = pageParam;

      const events = await nostr.query([filter]);
      return events
        .map(parseLetterEvent)
        .filter((l): l is Letter => l !== null)
        .sort((a, b) => b.timestamp - a.timestamp);
    },
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) => {
      if (lastPage.length < PAGE_SIZE) return undefined;
      const oldest = lastPage[lastPage.length - 1];
      return oldest ? oldest.timestamp : undefined;
    },
    enabled: !!user,
  });

  const data = useMemo(() => {
    if (!infiniteQuery.data) return undefined;
    return infiniteQuery.data.pages
      .flat()
      .filter((l) => !deletedIds.has(l.event.id));
  }, [infiniteQuery.data, deletedIds]);

  return {
    data,
    isLoading: infiniteQuery.isLoading,
    fetchNextPage: infiniteQuery.fetchNextPage,
    hasNextPage: infiniteQuery.hasNextPage,
    isFetchingNextPage: infiniteQuery.isFetchingNextPage,
  };
}

/** Result of decrypting a letter — includes extracted presentation data */
export interface DecryptedLetter {
  content: LetterContent;
  stationery?: Stationery;
}

/** Decrypt a letter's content using NIP-44 and extract presentation fields */
export function useDecryptLetter(letter: Letter | undefined) {
  const { user } = useCurrentUser();

  return useQuery({
    queryKey: ['letter-decrypt', letter?.event.id, user?.pubkey],
    queryFn: async (): Promise<DecryptedLetter | null> => {
      if (!user || !letter) return null;
      if (!user.signer.nip44) {
        throw new Error('NIP-44 encryption not supported by your signer');
      }

      const otherPubkey = letter.sender === user.pubkey
        ? letter.recipient
        : letter.sender;

      try {
        const decrypted = await user.signer.nip44.decrypt(otherPubkey, letter.event.content);
        const parsed = JSON.parse(decrypted) as LetterContent;
        if (!parsed.body) return null;

        return {
          content: parsed,
          stationery: parsed.stationery,
        };
      } catch {
        return null;
      }
    },
    enabled: !!user && !!letter && !!letter.event.content,
    retry: false,
  });
}

import { useMemo } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';
import { useCurrentUser } from './useCurrentUser';
import { useAppContext } from './useAppContext';
import { useMuteList } from './useMuteList';
import { isNostrId } from '@/lib/nostrId';
import { queryAllRelays } from '@/lib/queryAllRelays';
import { routeRequest } from '@/lib/reqRoutes';
import {
  LETTER_KIND,
  parseLetterContent,
  type Letter,
  type LetterContent,
  type Stationery,
} from '@/lib/letterTypes';

const PAGE_SIZE = 50;

/** Parse a letter event into a Letter object (without decrypting).
 *  All presentation data (stationery, frame, font) is inside the
 *  encrypted content and populated later by useDecryptLetter. */
function parseLetterEvent(event: NostrEvent): Letter | null {
  if (event.kind !== LETTER_KIND) return null;

  const recipient = event.tags.find(([name]) => name === 'p')?.[1];
  // Drop letters with a malformed recipient pubkey — they'd crash any
  // downstream nip19 encoder used to build a profile link.
  if (!isNostrId(recipient)) return null;

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

/**
 * Query every relay the pool would route `filters` to, waiting for each one
 * (see queryAllRelays) instead of resolving shortly after the first EOSE.
 */
function useQueryLetterRelays() {
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const { user } = useCurrentUser();

  return (filters: NostrFilter[], signal: AbortSignal) =>
    queryAllRelays(nostr, routeRequest(filters, config, user?.pubkey), filters, { signal });
}

/** Newest first, trimmed to one page: past the page, some relays' answers are cut off, so the oldest
 *  kept letter is a cursor every relay has answered up to. */
function toLetterPage(events: NostrEvent[]): Letter[] {
  return events
    .map(parseLetterEvent)
    .filter((l): l is Letter => l !== null)
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, PAGE_SIZE);
}

interface LetterMutes {
  mutedPubkeys: Set<string>;
  mutedLetters: Set<string>;
}

/**
 * Whether a letter is hidden by the mute list: the letter itself is muted, or
 * it was written by a muted user. Letters you sent stay, even to someone
 * you've since muted. Muted hashtags and words don't apply: letters carry no
 * `t` tags and their content is encrypted.
 */
function isLetterMuted(letter: Letter, mutes: LetterMutes): boolean {
  return mutes.mutedLetters.has(letter.event.id) || mutes.mutedPubkeys.has(letter.sender);
}

/** Muted pubkeys and events (NIP-51 kind 10000), as sets. */
function useLetterMutes(): LetterMutes {
  const { muteItems } = useMuteList();
  return useMemo(() => {
    const mutedPubkeys = new Set<string>();
    const mutedLetters = new Set<string>();
    for (const item of muteItems) {
      if (item.type === 'pubkey') mutedPubkeys.add(item.value);
      else if (item.type === 'thread') mutedLetters.add(item.value);
    }
    return { mutedPubkeys, mutedLetters };
  }, [muteItems]);
}

/** Flatten pages, dropping deleted and muted letters and the repeats `until` (inclusive) brings at page boundaries. */
function flattenPages(pages: Letter[][], deletedIds: Set<string>, mutes: LetterMutes): Letter[] {
  const seen = new Set<string>();
  return pages.flat().filter((l) => {
    if (deletedIds.has(l.event.id) || seen.has(l.event.id) || isLetterMuted(l, mutes)) return false;
    seen.add(l.event.id);
    return true;
  });
}

/** Stable empty set to avoid re-creating on every render when no deletions exist. */
const EMPTY_DELETED = new Set<string>();

/**
 * The user's NIP-09 deletions of letters, shared by every letter list. Read
 * up to 1000 so letters deleted long ago stay gone.
 */
function useLetterDeletions(): Set<string> {
  const { user } = useCurrentUser();
  const queryLetterRelays = useQueryLetterRelays();

  const { data } = useQuery({
    queryKey: ['letters-deletions', user?.pubkey],
    queryFn: async ({ signal }) => {
      if (!user) return [];
      return queryLetterRelays([{ kinds: [5], authors: [user.pubkey], '#k': [String(LETTER_KIND)], limit: 1000 }], signal);
    },
    enabled: !!user,
  });

  return useMemo(() => (data ? getDeletedIds(data) : EMPTY_DELETED), [data]);
}

function nextPageParam(lastPage: Letter[]): number | undefined {
  if (lastPage.length < PAGE_SIZE) return undefined;
  return lastPage[lastPage.length - 1]?.timestamp;
}

/** Fetch inbox letters (letters sent to the current user) with cursor-based pagination.
 *  When `friendPubkeys` is provided, only letters from those pubkeys are returned. */
export function useInbox(friendPubkeys?: string[]) {
  const { user } = useCurrentUser();
  const queryLetterRelays = useQueryLetterRelays();
  const deletedIds = useLetterDeletions();
  const mutes = useLetterMutes();

  const { data: raw, ...rest } = useInfiniteQuery({
    queryKey: ['letters-inbox', user?.pubkey, friendPubkeys ?? null],
    queryFn: async ({ pageParam, signal }) => {
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

      return toLetterPage(await queryLetterRelays([filter], signal));
    },
    initialPageParam: undefined as number | undefined,
    getNextPageParam: nextPageParam,
    enabled: !!user,
  });

  const data = useMemo(
    () => (raw ? flattenPages(raw.pages, deletedIds, mutes) : undefined),
    [raw, deletedIds, mutes],
  );

  return { data, ...rest };
}

/** Fetch sent letters (letters authored by the current user) with cursor-based pagination. */
export function useSentLetters() {
  const { user } = useCurrentUser();
  const queryLetterRelays = useQueryLetterRelays();
  const deletedIds = useLetterDeletions();
  const mutes = useLetterMutes();

  const { data: raw, ...rest } = useInfiniteQuery({
    queryKey: ['letters-sent', user?.pubkey],
    queryFn: async ({ pageParam, signal }) => {
      if (!user) return [];

      const filter: NostrFilter = {
        kinds: [LETTER_KIND],
        authors: [user.pubkey],
        limit: PAGE_SIZE,
      };
      if (pageParam) filter.until = pageParam;

      return toLetterPage(await queryLetterRelays([filter], signal));
    },
    initialPageParam: undefined as number | undefined,
    getNextPageParam: nextPageParam,
    enabled: !!user,
  });

  const data = useMemo(
    () => (raw ? flattenPages(raw.pages, deletedIds, mutes) : undefined),
    [raw, deletedIds, mutes],
  );

  return { data, ...rest };
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

      // Signer failures (a remote signer timing out, a rejected prompt) throw,
      // so they aren't cached and can be retried.
      const decrypted = await user.signer.nip44.decrypt(otherPubkey, letter.event.content);
      let raw: unknown;
      try {
        raw = JSON.parse(decrypted);
      } catch {
        return null;
      }
      // Anyone can write to anyone: validate every field before rendering.
      const content = parseLetterContent(raw);
      return content ? { content, stationery: content.stationery } : null;
    },
    enabled: !!user && !!letter && !!letter.event.content,
    retry: false,
    // Event content is immutable; never re-decrypt (each one is a signer
    // prompt for remote signers).
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

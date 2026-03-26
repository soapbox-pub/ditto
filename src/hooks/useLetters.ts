import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';
import { useCurrentUser } from './useCurrentUser';
import {
  LETTER_KIND,
  type Letter,
  type LetterContent,
  type Stationery,
} from '@/lib/letterTypes';

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

/** Fetch inbox letters (letters sent to the current user).
 *  When `friendPubkeys` is provided, only letters from those pubkeys are returned. */
export function useInbox(friendPubkeys?: string[]) {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();

  return useQuery({
    queryKey: ['letters-inbox', user?.pubkey, friendPubkeys ?? null],
    queryFn: async () => {
      if (!user) return [];

      // When filtering to friends, use authors filter at the relay level for efficiency
      const filter: NostrFilter = {
        kinds: [LETTER_KIND],
        '#p': [user.pubkey],
        limit: 50,
      };
      if (friendPubkeys) {
        // If user has no friends yet, return empty (no authors = match nothing)
        if (friendPubkeys.length === 0) return [];
        filter.authors = friendPubkeys;
      }

      // Fetch letters and the user's own deletion requests in one pass
      const [events, deletions] = await Promise.all([
        nostr.query([filter]),
        nostr.query([{ kinds: [5], authors: [user.pubkey], '#k': [String(LETTER_KIND)], limit: 50 }]),
      ]);

      const deletedIds = getDeletedIds(deletions);

      return events
        .map(parseLetterEvent)
        .filter((l): l is Letter => l !== null)
        .filter((l) => !deletedIds.has(l.event.id))
        .sort((a, b) => b.timestamp - a.timestamp);
    },
    enabled: !!user,
  });
}

/** Fetch sent letters (letters authored by the current user) */
export function useSentLetters() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();

  return useQuery({
    queryKey: ['letters-sent', user?.pubkey],
    queryFn: async () => {
      if (!user) return [];

      // Fetch letters and the user's own deletion requests in one pass
      const [events, deletions] = await Promise.all([
        nostr.query([{ kinds: [LETTER_KIND], authors: [user.pubkey], limit: 50 }]),
        nostr.query([{ kinds: [5], authors: [user.pubkey], '#k': [String(LETTER_KIND)], limit: 50 }]),
      ]);

      const deletedIds = getDeletedIds(deletions);

      return events
        .map(parseLetterEvent)
        .filter((l): l is Letter => l !== null)
        .filter((l) => !deletedIds.has(l.event.id))
        .sort((a, b) => b.timestamp - a.timestamp);
    },
    enabled: !!user,
  });
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

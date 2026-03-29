/**
 * useUserLists
 *
 * Hook for managing NIP-51 Follow Sets (kind 30000).
 * Follow Sets are addressable events identified by a `d` tag.
 * Each list has a title and contains `p` tags (pubkeys).
 *
 * Supports NIP-51 encrypted (private) items: pubkeys stored in the
 * encrypted `content` field are merged with public `p` tags.
 */
import { useMemo } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCurrentUser } from './useCurrentUser';
import { useNostrPublish } from './useNostrPublish';
import { useFollowPacks } from './useFollowPacks';
import { fetchFreshEvent } from '@/lib/fetchFreshEvent';
import type { NostrEvent, NostrSigner } from '@nostrify/nostrify';

export interface UserList {
  /** Unique d-tag identifier */
  id: string;
  /** Human-readable title (from `title` tag) */
  title: string;
  /** Optional description (from `description` or `summary` tag) */
  description?: string;
  /** Optional image URL (from `image` or `thumb` tag) */
  image?: string;
  /** All pubkeys in this list (public + private, deduplicated) */
  pubkeys: string[];
  /** Pubkeys that were stored in the encrypted content (private items) */
  privatePubkeys: string[];
  /** The underlying Nostr event */
  event: NostrEvent;
}

/** d-tags reserved by NIP-51 for other purposes — filter these out. */
const DEPRECATED_DTAGS = new Set(['mute', 'pin', 'bookmark', 'communities']);

/**
 * Detect whether encrypted content uses NIP-04 (legacy) or NIP-44 encoding.
 * NIP-51 says: "Clients can automatically discover if the encryption is NIP-04
 * or NIP-44 by searching for 'iv' in the ciphertext."
 */
function isNip04Encrypted(content: string): boolean {
  return content.includes('?iv=');
}

/**
 * Decrypt encrypted content from a NIP-51 list event, handling both NIP-44 and
 * legacy NIP-04 formats for backward compatibility per NIP-51.
 */
async function decryptListContent(
  content: string,
  signer: NostrSigner,
  pubkey: string,
): Promise<string[][] | null> {
  if (!content) return null;

  try {
    let decrypted: string | null = null;

    if (isNip04Encrypted(content)) {
      if (signer.nip04) {
        decrypted = await signer.nip04.decrypt(pubkey, content);
      } else {
        console.warn('List uses NIP-04 encryption but signer does not support nip04');
        return null;
      }
    } else {
      if (signer.nip44) {
        decrypted = await signer.nip44.decrypt(pubkey, content);
      } else {
        console.warn('List uses NIP-44 encryption but signer does not support nip44');
        return null;
      }
    }

    if (!decrypted) return null;
    const tags = JSON.parse(decrypted) as string[][];
    return Array.isArray(tags) ? tags : null;
  } catch (error) {
    console.error('Failed to decrypt list content:', error);
    return null;
  }
}

/** Parse a kind 30000 event into a UserList (public tags only, no decryption). */
function parseListEvent(event: NostrEvent): UserList {
  const getTag = (name: string) => event.tags.find(([n]) => n === name)?.[1];
  const id = getTag('d') ?? '';
  const title = getTag('title') || getTag('name') || id;
  const description = getTag('description') || getTag('summary') || undefined;
  const image = getTag('image') || getTag('thumb') || undefined;
  const pubkeys = event.tags.filter(([n]) => n === 'p').map(([, pk]) => pk);
  return { id, title, description, image, pubkeys, privatePubkeys: [], event };
}

/**
 * Parse a kind 30000 event with decryption of private items.
 * Private `p` tags from the encrypted content are merged with public tags.
 */
async function parseListEventWithDecryption(
  event: NostrEvent,
  signer: NostrSigner,
  pubkey: string,
): Promise<UserList> {
  const base = parseListEvent(event);

  if (!event.content) return base;

  const privateTags = await decryptListContent(event.content, signer, pubkey);
  if (!privateTags) return base;

  const privatePubkeys = privateTags
    .filter(([n]) => n === 'p')
    .map(([, pk]) => pk)
    .filter(Boolean);

  if (privatePubkeys.length === 0) return base;

  // Merge public + private pubkeys, deduplicated
  const publicSet = new Set(base.pubkeys);
  const allPubkeys = [...base.pubkeys];
  for (const pk of privatePubkeys) {
    if (!publicSet.has(pk)) {
      allPubkeys.push(pk);
    }
  }

  return { ...base, pubkeys: allPubkeys, privatePubkeys };
}

/**
 * Re-encrypt private pubkeys back into the content field.
 * Returns empty string if there are no private items.
 */
async function encryptPrivateTags(
  privatePubkeys: string[],
  signer: NostrSigner,
  pubkey: string,
): Promise<string> {
  if (privatePubkeys.length === 0) return '';
  if (!signer.nip44) {
    console.warn('Cannot re-encrypt private list items: signer does not support NIP-44');
    return '';
  }
  const tags = privatePubkeys.map((pk) => ['p', pk]);
  const plaintext = JSON.stringify(tags);
  return signer.nip44.encrypt(pubkey, plaintext);
}

export function useUserLists() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();
  const { mutateAsync: publishEvent } = useNostrPublish();

  /** Fetch all Follow Sets for the current user, excluding deleted ones */
  const listsQuery = useQuery({
    queryKey: ['user-lists', user?.pubkey],
    queryFn: async ({ signal }) => {
      if (!user) return [];
      const abortSignal = AbortSignal.any([signal, AbortSignal.timeout(8000)]);

      // Fetch lists and deletion events in parallel
      const [listEvents, deletionEvents] = await Promise.all([
        nostr.query(
          [{ kinds: [30000], authors: [user.pubkey], limit: 100 }],
          { signal: abortSignal },
        ),
        nostr.query(
          [{ kinds: [5], authors: [user.pubkey], '#k': ['30000'], limit: 200 }],
          { signal: abortSignal },
        ),
      ]);

      // Build a set of deleted list coordinate tags (e.g. "30000:<pubkey>:<d-tag>")
      const deletedCoords = new Set<string>();
      for (const del of deletionEvents) {
        for (const [name, value] of del.tags) {
          if (name === 'a' && value?.startsWith('30000:')) {
            deletedCoords.add(value);
          }
        }
      }

      const filtered = listEvents
        .filter((e) => {
          const dTag = e.tags.find(([n]) => n === 'd')?.[1] ?? '';
          if (DEPRECATED_DTAGS.has(dTag)) return false;
          // Filter out deleted lists
          const coord = `30000:${user.pubkey}:${dTag}`;
          if (deletedCoords.has(coord)) return false;
          // Filter out empty replacement events (from deletion step 1)
          // (note: events with encrypted content but no public tags are kept)
          const hasPTags = e.tags.some(([n]) => n === 'p');
          const hasTitle = e.tags.some(([n]) => n === 'title' || n === 'name');
          const hasContent = !!e.content;
          if (!hasPTags && !hasTitle && !hasContent) return false;
          return true;
        });

      // Decrypt private items in each list event
      const parsed = await Promise.all(
        filtered.map((e) => parseListEventWithDecryption(e, user.signer, user.pubkey)),
      );

      return parsed;
    },
    enabled: !!user,
    staleTime: 60 * 1000,
  });

  const lists: UserList[] = listsQuery.data ?? [];

  /** Create a new list. Returns the created UserList. */
  const createList = useMutation({
    mutationFn: async ({ title, description, pubkeys = [] }: { title: string; description?: string; pubkeys?: string[] }) => {
      if (!user) throw new Error('Must be logged in');
      const id = crypto.randomUUID();
      const tags: string[][] = [
        ['d', id],
        ['title', title.trim()],
        ...(description?.trim() ? [['description', description.trim()]] : []),
        ...pubkeys.map((pk) => ['p', pk]),
        ['alt', `Follow set: ${title.trim()}`],
      ];
      await publishEvent({
        kind: 30000,
        content: '',
        tags,
      } as Omit<NostrEvent, 'id' | 'pubkey' | 'sig'>);
      return { id, title: title.trim(), pubkeys };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-lists', user?.pubkey] });
    },
  });

  /** Add a pubkey to an existing list. */
  const addToList = useMutation({
    mutationFn: async ({ listId, pubkey }: { listId: string; pubkey: string }) => {
      if (!user) throw new Error('Must be logged in');

      // Fetch the freshest version of this specific list from relays
      const freshEvent = await fetchFreshEvent(nostr, {
        kinds: [30000],
        authors: [user.pubkey],
        '#d': [listId],
      });

      if (!freshEvent) throw new Error('List not found');

      const freshList = await parseListEventWithDecryption(freshEvent, user.signer, user.pubkey);

      // Guard against duplicates
      if (freshList.pubkeys.includes(pubkey)) return;

      const newTags = [...freshEvent.tags, ['p', pubkey]];
      const content = await encryptPrivateTags(freshList.privatePubkeys, user.signer, user.pubkey);
      await publishEvent({
        kind: 30000,
        content,
        tags: newTags,
      } as Omit<NostrEvent, 'id' | 'pubkey' | 'sig'>);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-lists', user?.pubkey] });
    },
  });

  /** Remove a pubkey from a list. */
  const removeFromList = useMutation({
    mutationFn: async ({ listId, pubkey }: { listId: string; pubkey: string }) => {
      if (!user) throw new Error('Must be logged in');

      // Fetch the freshest version of this specific list from relays
      const freshEvent = await fetchFreshEvent(nostr, {
        kinds: [30000],
        authors: [user.pubkey],
        '#d': [listId],
      });

      if (!freshEvent) throw new Error('List not found');

      const freshList = await parseListEventWithDecryption(freshEvent, user.signer, user.pubkey);

      // Remove from public tags
      const newTags = freshEvent.tags.filter(
        ([name, pk]) => !(name === 'p' && pk === pubkey),
      );
      // Remove from private pubkeys too
      const newPrivatePubkeys = freshList.privatePubkeys.filter((pk) => pk !== pubkey);
      const content = await encryptPrivateTags(newPrivatePubkeys, user.signer, user.pubkey);
      await publishEvent({
        kind: 30000,
        content,
        tags: newTags,
      } as Omit<NostrEvent, 'id' | 'pubkey' | 'sig'>);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-lists', user?.pubkey] });
    },
  });

  /** Rename a list. */
  const renameList = useMutation({
    mutationFn: async ({ listId, title }: { listId: string; title: string }) => {
      if (!user) throw new Error('Must be logged in');

      // Fetch the freshest version of this specific list from relays
      const freshEvent = await fetchFreshEvent(nostr, {
        kinds: [30000],
        authors: [user.pubkey],
        '#d': [listId],
      });

      if (!freshEvent) throw new Error('List not found');

      const freshList = await parseListEventWithDecryption(freshEvent, user.signer, user.pubkey);

      const newTags = freshEvent.tags.map(([name, ...rest]) =>
        name === 'title' ? ['title', title.trim(), ...rest] : [name, ...rest],
      );
      // If no title tag existed, add one
      if (!newTags.find(([n]) => n === 'title')) {
        newTags.push(['title', title.trim()]);
      }
      const content = await encryptPrivateTags(freshList.privatePubkeys, user.signer, user.pubkey);
      await publishEvent({
        kind: 30000,
        content,
        tags: newTags,
      } as Omit<NostrEvent, 'id' | 'pubkey' | 'sig'>);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-lists', user?.pubkey] });
    },
  });

  /** Delete a list by publishing an empty replacement, then a kind 5 deletion. */
  const deleteList = useMutation({
    mutationFn: async ({ listId }: { listId: string }) => {
      if (!user) throw new Error('Must be logged in');
      const list = lists.find((l) => l.id === listId);
      if (!list) throw new Error('List not found');

      // Step 1: Publish an empty replacement event to overwrite the content.
      // This ensures the relay replaces the old event with an empty one,
      // even if the relay doesn't fully support kind 5 deletions for
      // addressable events.
      await publishEvent({
        kind: 30000,
        content: '',
        tags: [['d', listId]],
      } as Omit<NostrEvent, 'id' | 'pubkey' | 'sig'>);

      // Step 2: Publish the kind 5 deletion event
      const coordTag = `30000:${user.pubkey}:${listId}`;
      await publishEvent({
        kind: 5,
        content: 'Deleted list',
        tags: [['a', coordTag], ['k', '30000']],
      } as Omit<NostrEvent, 'id' | 'pubkey' | 'sig'>);

      return { listId };
    },
    onSuccess: ({ listId }) => {
      // Optimistically remove the deleted list from the cache immediately,
      // since the relay may still return it for a short time after deletion.
      queryClient.setQueryData<UserList[]>(
        ['user-lists', user?.pubkey],
        (old) => old ? old.filter((l) => l.id !== listId) : [],
      );
    },
  });

  /** Check if a pubkey is in a specific list. */
  function isInList(listId: string, pubkey: string): boolean {
    return lists.find((l) => l.id === listId)?.pubkeys.includes(pubkey) ?? false;
  }

  return {
    lists,
    isLoading: listsQuery.isLoading,
    createList,
    addToList,
    removeFromList,
    renameList,
    deleteList,
    isInList,
  };
}

/**
 * Returns the `set:<id>` or `pack:<id>` picker value that matches the given
 * author pubkeys array, or `''` if no list/pack matches exactly.
 * Used by FeedEditModal, SavedFeedFiltersEditor, and SearchPage.
 */
export function useMatchedListId(authorPubkeys: string[]): string {
  const { lists } = useUserLists();
  const { data: followPacks = [] } = useFollowPacks();

  return useMemo(() => {
    if (authorPubkeys.length === 0) return '';
    const matchedSet = lists.find(
      (l) => l.pubkeys.length === authorPubkeys.length && authorPubkeys.every((pk) => l.pubkeys.includes(pk)),
    );
    if (matchedSet) return `set:${matchedSet.id}`;
    const matchedPack = followPacks.find(
      (p) => p.pubkeys.length === authorPubkeys.length && authorPubkeys.every((pk) => p.pubkeys.includes(pk)),
    );
    if (matchedPack) return `pack:${matchedPack.id}`;
    return '';
  }, [authorPubkeys, lists, followPacks]);
}

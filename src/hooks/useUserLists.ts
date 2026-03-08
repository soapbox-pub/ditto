/**
 * useUserLists
 *
 * Hook for managing NIP-51 Follow Sets (kind 30000).
 * Follow Sets are addressable events identified by a `d` tag.
 * Each list has a title and contains `p` tags (pubkeys).
 */
import { useMemo } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCurrentUser } from './useCurrentUser';
import { useNostrPublish } from './useNostrPublish';
import { useFollowPacks } from './useFollowPacks';
import type { NostrEvent } from '@nostrify/nostrify';

export interface UserList {
  /** Unique d-tag identifier */
  id: string;
  /** Human-readable title (from `title` tag) */
  title: string;
  /** Pubkeys in this list */
  pubkeys: string[];
  /** The underlying Nostr event */
  event: NostrEvent;
}

/** Parse a kind 30000 event into a UserList. */
function parseListEvent(event: NostrEvent): UserList {
  const id = event.tags.find(([n]) => n === 'd')?.[1] ?? '';
  const title = event.tags.find(([n]) => n === 'title')?.[1] ?? id;
  const pubkeys = event.tags.filter(([n]) => n === 'p').map(([, pk]) => pk);
  return { id, title, pubkeys, event };
}

export function useUserLists() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();
  const { mutateAsync: publishEvent } = useNostrPublish();

  /** Fetch all Follow Sets for the current user */
  const listsQuery = useQuery({
    queryKey: ['user-lists', user?.pubkey],
    queryFn: async ({ signal }) => {
      if (!user) return [];
      const events = await nostr.query(
        [{ kinds: [30000], authors: [user.pubkey], limit: 100 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) },
      );
      return events.map(parseListEvent);
    },
    enabled: !!user,
    staleTime: 60 * 1000,
  });

  const lists: UserList[] = listsQuery.data ?? [];

  /** Create a new list. Returns the created UserList. */
  const createList = useMutation({
    mutationFn: async ({ title, pubkeys = [] }: { title: string; pubkeys?: string[] }) => {
      if (!user) throw new Error('Must be logged in');
      const id = crypto.randomUUID();
      const tags: string[][] = [
        ['d', id],
        ['title', title.trim()],
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

  /** Add a pubkey to an existing list (or create if not found). */
  const addToList = useMutation({
    mutationFn: async ({ listId, pubkey }: { listId: string; pubkey: string }) => {
      if (!user) throw new Error('Must be logged in');
      const list = lists.find((l) => l.id === listId);
      if (!list) throw new Error('List not found');
      // Guard against both the parsed cache and the raw tags being stale
      const rawPubkeys = list.event.tags.filter(([n]) => n === 'p').map(([, pk]) => pk);
      if (list.pubkeys.includes(pubkey) || rawPubkeys.includes(pubkey)) return;

      const newTags = [...list.event.tags, ['p', pubkey]];
      await publishEvent({
        kind: 30000,
        content: list.event.content ?? '',
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
      const list = lists.find((l) => l.id === listId);
      if (!list) throw new Error('List not found');

      const newTags = list.event.tags.filter(
        ([name, pk]) => !(name === 'p' && pk === pubkey),
      );
      await publishEvent({
        kind: 30000,
        content: list.event.content ?? '',
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
      const list = lists.find((l) => l.id === listId);
      if (!list) throw new Error('List not found');

      const newTags = list.event.tags.map(([name, ...rest]) =>
        name === 'title' ? ['title', title.trim(), ...rest] : [name, ...rest],
      );
      // If no title tag existed, add one
      if (!newTags.find(([n]) => n === 'title')) {
        newTags.push(['title', title.trim()]);
      }
      await publishEvent({
        kind: 30000,
        content: list.event.content ?? '',
        tags: newTags,
      } as Omit<NostrEvent, 'id' | 'pubkey' | 'sig'>);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-lists', user?.pubkey] });
    },
  });

  /** Delete a list by publishing an empty event and then a kind 5 deletion. */
  const deleteList = useMutation({
    mutationFn: async ({ listId }: { listId: string }) => {
      if (!user) throw new Error('Must be logged in');
      const list = lists.find((l) => l.id === listId);
      if (!list) throw new Error('List not found');

      // Publish a deletion event (kind 5) targeting the addressable list
      const coordTag = `30000:${user.pubkey}:${listId}`;
      await publishEvent({
        kind: 5,
        content: 'Deleted list',
        tags: [['a', coordTag]],
      } as Omit<NostrEvent, 'id' | 'pubkey' | 'sig'>);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-lists', user?.pubkey] });
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

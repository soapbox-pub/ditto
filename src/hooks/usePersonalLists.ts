import { useNostr } from '@nostrify/react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCurrentUser } from './useCurrentUser';
import { useNostrPublish } from './useNostrPublish';
import { useAppContext } from './useAppContext';
import type { NostrEvent } from '@nostrify/nostrify';

/** d-tags reserved by NIP-51 for other purposes — filter these out. */
const DEPRECATED_DTAGS = new Set(['mute', 'pin', 'bookmark', 'communities']);

export interface PersonalList {
  event: NostrEvent;
  dTag: string;
  title: string;
  description: string;
  image?: string;
  pubkeys: string[];
}

function parseListEvent(event: NostrEvent): PersonalList {
  const getTag = (name: string) => event.tags.find(([n]) => n === name)?.[1];
  const dTag = getTag('d') ?? '';
  const title = getTag('title') || getTag('name') || dTag || 'Untitled List';
  const description = getTag('description') || getTag('summary') || '';
  const image = getTag('image') || getTag('thumb');
  const pubkeys = event.tags.filter(([n]) => n === 'p').map(([, pk]) => pk);

  return { event, dTag, title, description, image, pubkeys };
}

function generateDTag(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
}

/** Hook to manage the user's NIP-51 kind 30000 follow sets. */
export function usePersonalLists() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { config, updateConfig } = useAppContext();
  const queryClient = useQueryClient();
  const { mutateAsync: publishEvent } = useNostrPublish();

  const listsQuery = useQuery({
    queryKey: ['personal-lists', user?.pubkey],
    queryFn: async () => {
      if (!user) return [];
      const events = await nostr.query([{
        kinds: [30000],
        authors: [user.pubkey],
        limit: 100,
      }]);

      // Deduplicate by d-tag (keep newest)
      const byDTag = new Map<string, NostrEvent>();
      for (const ev of events) {
        const dTag = ev.tags.find(([n]) => n === 'd')?.[1] ?? '';
        if (DEPRECATED_DTAGS.has(dTag)) continue;
        const existing = byDTag.get(dTag);
        if (!existing || ev.created_at > existing.created_at) {
          byDTag.set(dTag, ev);
        }
      }

      // Filter out deleted lists (empty replacements with only a d-tag)
      return Array.from(byDTag.values())
        .filter((ev) => ev.tags.some(([n]) => n === 'p') || ev.tags.some(([n]) => n === 'title' || n === 'name'))
        .map(parseListEvent);
    },
    enabled: !!user,
  });

  const lists = listsQuery.data ?? [];

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['personal-lists', user?.pubkey] });
    // Also invalidate addr-event queries so detail views refresh after mutations
    queryClient.invalidateQueries({ queryKey: ['addr-event', 30000, user?.pubkey] });
  };

  const createList = useMutation({
    mutationFn: async ({ title, description }: { title: string; description?: string }) => {
      if (!user) throw new Error('User is not logged in');
      const dTag = generateDTag();
      const tags: string[][] = [['d', dTag], ['title', title]];
      if (description) tags.push(['description', description]);

      return publishEvent({
        kind: 30000,
        content: '',
        tags,
        created_at: Math.floor(Date.now() / 1000),
      } as Omit<NostrEvent, 'id' | 'pubkey' | 'sig'>);
    },
    onSuccess: invalidate,
  });

  const addToList = useMutation({
    mutationFn: async ({ dTag, pubkey }: { dTag: string; pubkey: string }) => {
      if (!user) throw new Error('User is not logged in');
      const list = lists.find((l) => l.dTag === dTag);
      if (!list) throw new Error(`List not found: ${dTag}`);

      // Don't add duplicates
      if (list.pubkeys.includes(pubkey)) return list.event;

      const newTags = [...list.event.tags, ['p', pubkey]];
      return publishEvent({
        kind: 30000,
        content: list.event.content,
        tags: newTags,
        created_at: Math.floor(Date.now() / 1000),
      } as Omit<NostrEvent, 'id' | 'pubkey' | 'sig'>);
    },
    onSuccess: invalidate,
  });

  const removeFromList = useMutation({
    mutationFn: async ({ dTag, pubkey }: { dTag: string; pubkey: string }) => {
      if (!user) throw new Error('User is not logged in');
      const list = lists.find((l) => l.dTag === dTag);
      if (!list) throw new Error(`List not found: ${dTag}`);

      const newTags = list.event.tags.filter(
        ([name, value]) => !(name === 'p' && value === pubkey),
      );
      return publishEvent({
        kind: 30000,
        content: list.event.content,
        tags: newTags,
        created_at: Math.floor(Date.now() / 1000),
      } as Omit<NostrEvent, 'id' | 'pubkey' | 'sig'>);
    },
    onSuccess: invalidate,
  });

  const deleteList = useMutation({
    mutationFn: async (dTag: string) => {
      if (!user) throw new Error('User is not logged in');

      // Unpin if pinned
      if (config.pinnedLists.includes(dTag)) {
        updateConfig((c) => ({
          ...c,
          pinnedLists: (c.pinnedLists ?? []).filter((d) => d !== dTag),
        }));
      }

      // Publish empty replacement (only d-tag)
      return publishEvent({
        kind: 30000,
        content: '',
        tags: [['d', dTag]],
        created_at: Math.floor(Date.now() / 1000),
      } as Omit<NostrEvent, 'id' | 'pubkey' | 'sig'>);
    },
    onSuccess: invalidate,
  });

  const updateList = useMutation({
    mutationFn: async ({ dTag, title, description }: { dTag: string; title?: string; description?: string }) => {
      if (!user) throw new Error('User is not logged in');
      const list = lists.find((l) => l.dTag === dTag);
      if (!list) throw new Error(`List not found: ${dTag}`);

      // Preserve all tags, updating/adding title and description
      const newTags = list.event.tags.filter(
        ([name]) => name !== 'title' && name !== 'name' && name !== 'description' && name !== 'summary',
      );
      if (title !== undefined) newTags.push(['title', title]);
      else newTags.push(['title', list.title]);
      if (description !== undefined) newTags.push(['description', description]);
      else if (list.description) newTags.push(['description', list.description]);

      return publishEvent({
        kind: 30000,
        content: list.event.content,
        tags: newTags,
        created_at: Math.floor(Date.now() / 1000),
      } as Omit<NostrEvent, 'id' | 'pubkey' | 'sig'>);
    },
    onSuccess: invalidate,
  });

  /** Which of the user's lists contain a given pubkey. */
  function getListsForPubkey(pubkey: string): PersonalList[] {
    return lists.filter((l) => l.pubkeys.includes(pubkey));
  }

  /** Pin a list to the main feed tab bar. */
  function pinList(dTag: string) {
    updateConfig((c) => {
      const current = c.pinnedLists ?? [];
      if (current.includes(dTag)) return c;
      return { ...c, pinnedLists: [...current, dTag] };
    });
  }

  /** Unpin a list from the main feed tab bar. */
  function unpinList(dTag: string) {
    updateConfig((c) => ({
      ...c,
      pinnedLists: (c.pinnedLists ?? []).filter((d) => d !== dTag),
    }));
  }

  return {
    lists,
    isLoading: listsQuery.isLoading,
    createList,
    addToList,
    removeFromList,
    deleteList,
    updateList,
    getListsForPubkey,
    pinList,
    unpinList,
  };
}

export { DEPRECATED_DTAGS };

import { useNostr } from '@nostrify/react';
import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';

import { useCurrentUser } from './useCurrentUser';
import { useNostrPublish } from './useNostrPublish';
import { useNostrStorage } from './useNostrStorage';
import { useAppContext } from './useAppContext';
import { fetchFreshEvent } from '@/lib/fetchFreshEvent';
import {
  editNip51List,
  listVisibility,
  makeListPrivate,
  readNip51List,
  type Nip51ListContents,
  type Nip51ListEdit,
} from '@/lib/nip51List';
import { isNostrId } from '@/lib/nostrId';
import { getStorageKey } from '@/lib/storageKey';

export interface MuteListItem {
  type: 'pubkey' | 'hashtag' | 'word' | 'thread';
  value: string;
}

/** Build the localStorage key for cached mute list items. */
export function getMuteCacheKey(appId: string): string {
  return getStorageKey(appId, 'muteListCache');
}

/** Read cached mute items from localStorage for a given user. */
function getCachedMuteItems(cacheKey: string, pubkey: string): MuteListItem[] | undefined {
  try {
    const raw = localStorage.getItem(cacheKey);
    if (!raw) return undefined;
    const cached = JSON.parse(raw);
    if (cached.pubkey !== pubkey || !Array.isArray(cached.items)) return undefined;
    return cached.items;
  } catch {
    return undefined;
  }
}

/** Persist decrypted mute items to localStorage. */
export function setCachedMuteItems(appId: string, pubkey: string, items: MuteListItem[]): void {
  try {
    localStorage.setItem(getMuteCacheKey(appId), JSON.stringify({ pubkey, items }));
  } catch {
    // Storage full or unavailable — non-critical
  }
}

/** Parse decrypted mute list tags into structured items. */
export function parseMuteTags(tags: string[][]): MuteListItem[] {
  const items: MuteListItem[] = [];
  for (const tag of tags) {
    const [tagName, value] = tag;
    if (!value) continue;
    switch (tagName) {
      // Pubkey and event-id mute entries must be valid 64-char hex — anything
      // else would crash nip19 encoders in the mute-list management UI.
      case 'p': if (isNostrId(value)) items.push({ type: 'pubkey', value }); break;
      case 't': items.push({ type: 'hashtag', value }); break;
      case 'word': items.push({ type: 'word', value }); break;
      case 'e': if (isNostrId(value)) items.push({ type: 'thread', value }); break;
    }
  }
  return items;
}

/** Mute entry tag names (NIP-51 kind 10000). */
const MUTE_TAG_NAMES = new Set(['p', 't', 'word', 'e']);

/** Whether a tag is a mute entry, as opposed to `alt`, `client`, etc. */
function isMuteTag(tag: string[]): boolean {
  return MUTE_TAG_NAMES.has(tag[0]) && !!tag[1];
}

/** The tag that stores a mute item. */
function muteItemToTag(item: MuteListItem): string[] {
  const name = item.type === 'pubkey' ? 'p' : item.type === 'hashtag' ? 't' : item.type === 'word' ? 'word' : 'e';
  return [name, item.value];
}

/** Deduplicated mute items from both halves of a list. */
function itemsFromContents(contents: Nip51ListContents): MuteListItem[] {
  const seen = new Set<string>();
  const combined: MuteListItem[] = [];
  for (const item of [...parseMuteTags(contents.publicTags), ...parseMuteTags(contents.privateTags)]) {
    const key = `${item.type}:${item.value}`;
    if (!seen.has(key)) {
      seen.add(key);
      combined.push(item);
    }
  }
  return combined;
}

/**
 * Stable empty-array identity returned while the mute list is loading, so
 * consumers that memoize on `muteItems` (feed filters) don't recompute on
 * every render.
 */
const EMPTY_MUTE_ITEMS: MuteListItem[] = [];

/**
 * Hook to manage NIP-51 mute lists (kind 10000). Entries are edited in the
 * visibility the list already has; see `nip51List`.
 */
export function useMuteList() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { config } = useAppContext();
  const queryClient = useQueryClient();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const { store } = useNostrStorage();
  const cacheKey = getMuteCacheKey(config.appId);

  // Placeholder from localStorage so mutes apply immediately on page load.
  // Memoized — this hook runs in every NoteCard, and an unmemoized read would
  // JSON.parse the cached list on every render of every card.
  const userPubkey = user?.pubkey;
  const cachedItems = useMemo(
    () => userPubkey ? getCachedMuteItems(cacheKey, userPubkey) : undefined,
    [cacheKey, userPubkey],
  );

  // Query the current mute list
  const query = useQuery({
    queryKey: ['muteList', user?.pubkey],
    queryFn: async () => {
      if (!user) return null;

      const filter: NostrFilter = {
        kinds: [10000],
        authors: [user.pubkey],
        limit: 1,
      };

      const events = await nostr.query([filter]);
      if (events.length === 0) return null;

      return events[0];
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  // Parse mute list into structured items (public tags + encrypted content)
  const muteItems = useQuery({
    queryKey: ['muteItems', query.data?.id],
    queryFn: async () => {
      const event = query.data;
      if (!event || !user) return [];

      const contents = await readNip51List(event, user.signer, user.pubkey);

      // If the private part couldn't be decrypted, keep applying the last
      // mutes we could read rather than dropping every private mute.
      if (contents.unreadable) {
        return itemsFromContents({ ...contents, privateTags: (cachedItems ?? []).map(muteItemToTag) });
      }

      const items = itemsFromContents(contents);

      // Persist to localStorage for next page load
      setCachedMuteItems(config.appId, user.pubkey, items);

      return items;
    },
    enabled: !!query.data && !!user,
    placeholderData: cachedItems,
  });

  /**
   * Read-modify-write the mute list in its current mode (public or private,
   * see `nip51List`). Returns the resulting items, which are applied to the
   * caches before publishing so mutes take effect immediately.
   */
  const editMuteList = async (
    edit: (prev: NostrEvent | null, contents: Nip51ListContents) => Promise<Nip51ListEdit | null>,
  ): Promise<void> => {
    if (!user) throw new Error('User not logged in');

    // Fetch the freshest kind 10000 from relays before mutating. Pass the
    // local store as a fallback floor: a kind 10000 is replaceable, so a relay
    // miss returning null would otherwise rebuild from an empty base and wipe
    // every mute made on another client.
    const prev = await fetchFreshEvent(nostr, { kinds: [10000], authors: [user.pubkey] }, { store });
    const contents = await readNip51List(prev, user.signer, user.pubkey);
    const next = await edit(prev, contents);
    if (!next) return;

    // When the private half is unreadable, `next.privateTags` is empty but the
    // encrypted content is carried over unchanged. Keep applying the private
    // mutes we last read: the cached items that weren't public in `prev`.
    let privateTags = next.privateTags;
    if (contents.unreadable) {
      const prevPublic = new Set(parseMuteTags(contents.publicTags).map((i) => `${i.type}:${i.value}`));
      const cached = getCachedMuteItems(cacheKey, user.pubkey) ?? [];
      privateTags = cached.filter((i) => !prevPublic.has(`${i.type}:${i.value}`)).map(muteItemToTag);
    }
    const newItems = itemsFromContents({ publicTags: next.tags, privateTags, unreadable: false });

    // Update localStorage and the in-memory cache so isMuted() flips
    // immediately, before the relay round-trip.
    setCachedMuteItems(config.appId, user.pubkey, newItems);
    if (query.data?.id) {
      queryClient.setQueryData<MuteListItem[]>(['muteItems', query.data.id], newItems);
    }

    await publishEvent({ kind: 10000, tags: next.tags, content: next.content, prev: prev ?? undefined });
  };

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['muteList', user?.pubkey] });

  // Add item to mute list
  const addMute = useMutation({
    mutationFn: async (item: MuteListItem) => {
      if (!user) throw new Error('User not logged in');

      // Normalize the value based on type. Throw on unrecognisable input
      // rather than silently storing garbage that would crash renderers.
      let normalizedValue = item.value;

      if (item.type === 'pubkey') {
        const np = normalizePubkey(item.value);
        if (!np) throw new Error(`Invalid pubkey: ${item.value}`);
        normalizedValue = np;
      } else if (item.type === 'thread') {
        const ne = normalizeEventId(item.value);
        if (!ne) throw new Error(`Invalid event id: ${item.value}`);
        normalizedValue = ne;
      }

      await editMuteList((prev, contents) => editNip51List({
        prev,
        contents,
        signer: user.signer,
        pubkey: user.pubkey,
        add: [muteItemToTag({ ...item, value: normalizedValue })],
        isEntry: isMuteTag,
      }));
    },
    onSuccess: invalidate,
  });

  // Remove item from mute list
  const removeMute = useMutation({
    mutationFn: async (item: MuteListItem) => {
      if (!user) throw new Error('User not logged in');
      const target = muteItemToTag(item);

      await editMuteList((prev, contents) => editNip51List({
        prev,
        contents,
        signer: user.signer,
        pubkey: user.pubkey,
        remove: (tag) => tag[0] === target[0] && tag[1] === target[1],
        isEntry: isMuteTag,
      }));
    },
    onSuccess: invalidate,
  });

  // Bulk-add many pubkeys to the mute list in a single publish.
  // Returns the count of pubkeys newly muted (excluding ones already muted).
  const muteManyPubkeys = useMutation<number, Error, string[]>({
    mutationFn: async (pubkeys: string[]): Promise<number> => {
      if (!user) throw new Error('User not logged in');

      // Normalize + dedupe input — drop entries we can't recognise.
      const normalized = new Set<string>();
      for (const pk of pubkeys) {
        if (!pk) continue;
        const np = normalizePubkey(pk);
        if (np) normalized.add(np);
      }

      let added = 0;
      await editMuteList(async (prev, contents) => {
        const alreadyMuted = new Set(
          itemsFromContents(contents).filter((i) => i.type === 'pubkey').map((i) => i.value),
        );
        const toAdd = [...normalized].filter((pk) => !alreadyMuted.has(pk));
        added = toAdd.length;

        // Nothing to add — skip the publish to avoid a no-op kind 10000 broadcast
        if (!toAdd.length) return null;

        return editNip51List({
          prev,
          contents,
          signer: user.signer,
          pubkey: user.pubkey,
          add: toAdd.map((pk) => ['p', pk]),
          isEntry: isMuteTag,
        });
      });
      return added;
    },
    onSuccess: invalidate,
  });

  // Move a public mute list's entries into the encrypted content.
  const makeMuteListPrivate = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('User not logged in');
      await editMuteList((_prev, contents) => makeListPrivate({
        contents,
        signer: user.signer,
        pubkey: user.pubkey,
        isEntry: isMuteTag,
      }));
    },
    onSuccess: invalidate,
  });

  // Check if a specific item is muted
  const isMuted = (type: MuteListItem['type'], value: string): boolean => {
    const items = muteItems.data || [];
    return items.some((item) => item.type === type && item.value === value);
  };

  // Get all muted pubkeys
  const mutedPubkeys = (): string[] => {
    const items = muteItems.data || [];
    return items.filter((item) => item.type === 'pubkey').map((item) => item.value);
  };

  // Get all muted hashtags
  const mutedHashtags = (): string[] => {
    const items = muteItems.data || [];
    return items.filter((item) => item.type === 'hashtag').map((item) => item.value);
  };

  // Get all muted words
  const mutedWords = (): string[] => {
    const items = muteItems.data || [];
    return items.filter((item) => item.type === 'word').map((item) => item.value);
  };

  // Get all muted threads
  const mutedThreads = (): string[] => {
    const items = muteItems.data || [];
    return items.filter((item) => item.type === 'thread').map((item) => item.value);
  };

  return {
    muteList: query.data,
    muteItems: muteItems.data ?? EMPTY_MUTE_ITEMS,
    isLoading: query.isLoading || muteItems.isLoading,
    isError: query.isError || muteItems.isError,
    error: query.error || muteItems.error,
    /** The list stores entries publicly; offer to make it private. */
    isPublic: listVisibility(query.data, isMuteTag) === 'public',
    addMute,
    removeMute,
    muteManyPubkeys,
    makeMuteListPrivate,
    isMuted,
    mutedPubkeys,
    mutedHashtags,
    mutedWords,
    mutedThreads,
  };
}

/**
 * Normalize a pubkey value that might be hex or npub/nprofile.
 *
 * Returns `undefined` when the value isn't a recognisable pubkey form. The
 * previous behaviour of returning the original (invalid) string silently
 * polluted the mute list with garbage that crashed `nip19.npubEncode`
 * downstream in rendering — callers must now drop the entry.
 */
function normalizePubkey(value: string): string | undefined {
  // If it's a valid hex pubkey, return as-is.
  if (isNostrId(value)) {
    return value;
  }

  // If it's an npub or nprofile, try to decode it
  if (value.startsWith('npub1') || value.startsWith('nprofile1')) {
    try {
      const decoded = nip19.decode(value);
      if (decoded.type === 'npub') {
        return decoded.data;
      } else if (decoded.type === 'nprofile') {
        return decoded.data.pubkey;
      }
    } catch (error) {
      console.warn('Failed to decode npub/nprofile:', error);
    }
  }

  return undefined;
}

/**
 * Normalize an event ID that might be hex or note/nevent.
 *
 * Returns `undefined` when the value isn't a recognisable event-id form.
 * See {@link normalizePubkey} for why we no longer fall through to the
 * original string.
 */
function normalizeEventId(value: string): string | undefined {
  // If it's a valid hex event ID, return as-is.
  if (isNostrId(value)) {
    return value;
  }

  // If it's a note or nevent, try to decode it
  if (value.startsWith('note1') || value.startsWith('nevent1')) {
    try {
      const decoded = nip19.decode(value);
      if (decoded.type === 'note') {
        return decoded.data;
      } else if (decoded.type === 'nevent') {
        return decoded.data.id;
      }
    } catch (error) {
      console.warn('Failed to decode note/nevent:', error);
    }
  }

  return undefined;
}

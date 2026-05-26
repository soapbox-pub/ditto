import { useNostr } from '@nostrify/react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent, NostrFilter, NostrSigner } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';

import { useCurrentUser } from './useCurrentUser';
import { useNostrPublish } from './useNostrPublish';
import { useAppContext } from './useAppContext';
import { fetchFreshEvent } from '@/lib/fetchFreshEvent';
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

/**
 * Detect whether encrypted content uses NIP-04 (legacy) or NIP-44 encoding.
 * NIP-51 says: "Clients can automatically discover if the encryption is NIP-04
 * or NIP-44 by searching for 'iv' in the ciphertext."
 */
function isNip04Encrypted(content: string): boolean {
  return content.includes('?iv=');
}

/**
 * Decrypt encrypted content from a kind 10000 event, handling both NIP-44 and
 * legacy NIP-04 formats for backward compatibility per NIP-51.
 */
async function decryptContent(
  content: string,
  signer: NostrSigner,
  pubkey: string,
): Promise<string | null> {
  if (!content) return null;

  try {
    if (isNip04Encrypted(content)) {
      // NIP-04 legacy encryption
      if (signer.nip04) {
        return await signer.nip04.decrypt(pubkey, content);
      }
      console.warn('Mute list uses NIP-04 encryption but signer does not support nip04');
      return null;
    } else {
      // NIP-44 encryption
      if (signer.nip44) {
        return await signer.nip44.decrypt(pubkey, content);
      }
      console.warn('Mute list uses NIP-44 encryption but signer does not support nip44');
      return null;
    }
  } catch (error) {
    console.error('Failed to decrypt mute list content:', error);
    return null;
  }
}

/**
 * Parse all mute items from a kind 10000 event, combining both public tags
 * and encrypted (private) content per NIP-51.
 */
async function getAllMuteItems(
  event: NostrEvent | null,
  signer: NostrSigner,
  pubkey: string,
): Promise<MuteListItem[]> {
  if (!event) return [];

  // Parse public tags from the event
  const publicItems = parseMuteTags(event.tags);

  // Parse private (encrypted) items from the content
  let privateItems: MuteListItem[] = [];
  if (event.content) {
    const decrypted = await decryptContent(event.content, signer, pubkey);
    if (decrypted) {
      try {
        const tags = JSON.parse(decrypted) as string[][];
        privateItems = parseMuteTags(tags);
      } catch (error) {
        console.error('Failed to parse decrypted mute list content:', error);
      }
    }
  }

  // Deduplicate: combine public + private, removing duplicates
  const seen = new Set<string>();
  const combined: MuteListItem[] = [];
  for (const item of [...publicItems, ...privateItems]) {
    const key = `${item.type}:${item.value}`;
    if (!seen.has(key)) {
      seen.add(key);
      combined.push(item);
    }
  }

  return combined;
}

/**
 * Hook to manage NIP-51 mute lists (kind 10000)
 * All mute items are encrypted for privacy
 */
export function useMuteList() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { config } = useAppContext();
  const queryClient = useQueryClient();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const cacheKey = getMuteCacheKey(config.appId);

  // Placeholder from localStorage so mutes apply immediately on page load
  const cachedItems = user ? getCachedMuteItems(cacheKey, user.pubkey) : undefined;

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

      const items = await getAllMuteItems(event, user.signer, user.pubkey);

      // Persist to localStorage for next page load
      setCachedMuteItems(config.appId, user.pubkey, items);

      return items;
    },
    enabled: !!query.data && !!user,
    placeholderData: cachedItems,
  });

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

      // ① Fetch the freshest kind 10000 from relays before mutating
      const prev = await fetchFreshEvent(nostr, { kinds: [10000], authors: [user.pubkey] });
      const currentItems = await getAllMuteItems(prev, user.signer, user.pubkey);

      // ② Add only if not already present (dedup)
      const alreadyMuted = currentItems.some(
        (i) => i.type === item.type && i.value === normalizedValue,
      );
      const newItems = alreadyMuted
        ? currentItems
        : [...currentItems, { ...item, value: normalizedValue }];

      // Update localStorage immediately so it survives page refresh
      setCachedMuteItems(config.appId, user.pubkey, newItems);

      await updateMuteList(newItems, prev);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['muteList', user?.pubkey] });
    },
  });

  // Remove item from mute list
  const removeMute = useMutation({
    mutationFn: async (item: MuteListItem) => {
      if (!user) throw new Error('User not logged in');

      // ① Fetch the freshest kind 10000 from relays before mutating
      const prev = await fetchFreshEvent(nostr, { kinds: [10000], authors: [user.pubkey] });
      const currentItems = await getAllMuteItems(prev, user.signer, user.pubkey);

      // ② Remove the target item
      const newItems = currentItems.filter(
        (i) => !(i.type === item.type && i.value === item.value),
      );

      // Update localStorage immediately so it survives page refresh
      setCachedMuteItems(config.appId, user.pubkey, newItems);

      await updateMuteList(newItems, prev);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['muteList', user?.pubkey] });
    },
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

      // ① Fetch the freshest kind 10000 from relays
      const prev = await fetchFreshEvent(nostr, { kinds: [10000], authors: [user.pubkey] });
      const currentItems = await getAllMuteItems(prev, user.signer, user.pubkey);

      // ② Determine which pubkeys are not already muted
      const alreadyMuted = new Set(
        currentItems.filter((i) => i.type === 'pubkey').map((i) => i.value),
      );
      const toAdd: MuteListItem[] = [];
      for (const pk of normalized) {
        if (!alreadyMuted.has(pk)) {
          toAdd.push({ type: 'pubkey', value: pk });
        }
      }

      // Nothing to add — skip the publish to avoid a no-op kind 10000 broadcast
      if (toAdd.length === 0) return 0;

      const newItems = [...currentItems, ...toAdd];

      // Update localStorage immediately so mutes apply on refresh
      setCachedMuteItems(config.appId, user.pubkey, newItems);

      await updateMuteList(newItems, prev);

      return toAdd.length;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['muteList', user?.pubkey] });
    },
  });

  // Update entire mute list
  const updateMuteList = async (items: MuteListItem[], prev: NostrEvent | null) => {
    if (!user) throw new Error('User not logged in');
    if (!user.signer.nip44) throw new Error('NIP-44 encryption not supported');

    const tags: string[][] = [];

    for (const item of items) {
      const tag = [
        item.type === 'pubkey' ? 'p' :
        item.type === 'hashtag' ? 't' :
        item.type === 'word' ? 'word' :
        'e',
        item.value,
      ];
      tags.push(tag);
    }

    // Encrypt all mutes
    const plaintext = JSON.stringify(tags);
    const content = await user.signer.nip44.encrypt(user.pubkey, plaintext);

    await publishEvent({
      kind: 10000,
      content,
      tags: [],
      prev: prev ?? undefined,
    });
  };

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
    muteItems: muteItems.data || [],
    isLoading: query.isLoading || muteItems.isLoading,
    isError: query.isError || muteItems.isError,
    error: query.error || muteItems.error,
    addMute,
    removeMute,
    muteManyPubkeys,
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

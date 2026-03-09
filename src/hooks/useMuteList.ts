import { useNostr } from '@nostrify/react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent, NostrFilter, NostrSigner } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';

import { useCurrentUser } from './useCurrentUser';
import { useNostrPublish } from './useNostrPublish';

export interface MuteListItem {
  type: 'pubkey' | 'hashtag' | 'word' | 'thread';
  value: string;
}

/** localStorage key for cached mute list items. */
const MUTE_CACHE_KEY = 'ditto:muteListCache';

/** Read cached mute items from localStorage for a given user. */
function getCachedMuteItems(pubkey: string): MuteListItem[] | undefined {
  try {
    const raw = localStorage.getItem(MUTE_CACHE_KEY);
    if (!raw) return undefined;
    const cached = JSON.parse(raw);
    if (cached.pubkey !== pubkey || !Array.isArray(cached.items)) return undefined;
    return cached.items;
  } catch {
    return undefined;
  }
}

/** Persist decrypted mute items to localStorage. */
export function setCachedMuteItems(pubkey: string, items: MuteListItem[]): void {
  try {
    localStorage.setItem(MUTE_CACHE_KEY, JSON.stringify({ pubkey, items }));
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
      case 'p': items.push({ type: 'pubkey', value }); break;
      case 't': items.push({ type: 'hashtag', value }); break;
      case 'word': items.push({ type: 'word', value }); break;
      case 'e': items.push({ type: 'thread', value }); break;
    }
  }
  return items;
}

/**
 * Fetches the absolute freshest kind 10000 mute list via the pool.
 * Mirrors the safety pattern from useFollowActions' fetchFreshFollowEvent.
 */
async function fetchFreshMuteEvent(
  nostr: ReturnType<typeof useNostr>['nostr'],
  pubkey: string,
): Promise<NostrEvent | null> {
  const signal = AbortSignal.timeout(10_000);

  const muteEvents = await nostr.query(
    [{ kinds: [10000], authors: [pubkey], limit: 1 }],
    { signal },
  );

  if (muteEvents.length === 0) return null;

  // Pick the most recent event across all relays
  return muteEvents.reduce((latest, current) =>
    current.created_at > latest.created_at ? current : latest,
  );
}

/**
 * Decrypt a kind 10000 event's content and parse into MuteListItems.
 * Returns an empty array if the event has no encrypted content.
 */
async function decryptMuteItems(
  event: NostrEvent | null,
  signer: NostrSigner,
  pubkey: string,
): Promise<MuteListItem[]> {
  if (!event?.content || !signer.nip44) return [];

  try {
    const decrypted = await signer.nip44.decrypt(pubkey, event.content);
    const tags = JSON.parse(decrypted) as string[][];
    return parseMuteTags(tags);
  } catch (error) {
    console.error('Failed to decrypt mute items:', error);
    return [];
  }
}

/**
 * Hook to manage NIP-51 mute lists (kind 10000)
 * All mute items are encrypted for privacy
 */
export function useMuteList() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();
  const { mutateAsync: publishEvent } = useNostrPublish();

  // Placeholder from localStorage so mutes apply immediately on page load
  const cachedItems = user ? getCachedMuteItems(user.pubkey) : undefined;

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

  // Parse mute list into structured items
  const muteItems = useQuery({
    queryKey: ['muteItems', query.data?.id],
    queryFn: async () => {
      const event = query.data;
      if (!event || !user) return [];

      // All mutes are encrypted in content field
      if (!event.content || !user.signer.nip44) {
        return [];
      }

      try {
        const decrypted = await user.signer.nip44.decrypt(user.pubkey, event.content);
        const tags = JSON.parse(decrypted) as string[][];
        const items = parseMuteTags(tags);

        // Persist to localStorage for next page load
        setCachedMuteItems(user.pubkey, items);

        return items;
      } catch (error) {
        console.error('Failed to decrypt mute items:', error);
        return [];
      }
    },
    enabled: !!query.data && !!user,
    placeholderData: cachedItems,
  });

  // Add item to mute list
  const addMute = useMutation({
    mutationFn: async (item: MuteListItem) => {
      if (!user) throw new Error('User not logged in');

      // Normalize the value based on type
      let normalizedValue = item.value;
      
      if (item.type === 'pubkey') {
        normalizedValue = normalizePubkey(item.value);
      } else if (item.type === 'thread') {
        normalizedValue = normalizeEventId(item.value);
      }

      // ① Fetch the freshest kind 10000 from relays before mutating
      const freshEvent = await fetchFreshMuteEvent(nostr, user.pubkey);
      const currentItems = await decryptMuteItems(freshEvent, user.signer, user.pubkey);

      // ② Add only if not already present (dedup)
      const alreadyMuted = currentItems.some(
        (i) => i.type === item.type && i.value === normalizedValue,
      );
      const newItems = alreadyMuted
        ? currentItems
        : [...currentItems, { ...item, value: normalizedValue }];

      // Update localStorage immediately so it survives page refresh
      setCachedMuteItems(user.pubkey, newItems);

      await updateMuteList(newItems);
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
      const freshEvent = await fetchFreshMuteEvent(nostr, user.pubkey);
      const currentItems = await decryptMuteItems(freshEvent, user.signer, user.pubkey);

      // ② Remove the target item
      const newItems = currentItems.filter(
        (i) => !(i.type === item.type && i.value === item.value),
      );

      // Update localStorage immediately so it survives page refresh
      setCachedMuteItems(user.pubkey, newItems);

      await updateMuteList(newItems);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['muteList', user?.pubkey] });
    },
  });

  // Update entire mute list
  const updateMuteList = async (items: MuteListItem[]) => {
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
      tags: [], // No public tags, everything encrypted
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
    isMuted,
    mutedPubkeys,
    mutedHashtags,
    mutedWords,
    mutedThreads,
  };
}

/**
 * Normalize a pubkey value that might be hex or npub
 */
function normalizePubkey(value: string): string {
  // If it looks like a hex pubkey (64 chars), return as-is
  if (/^[0-9a-f]{64}$/i.test(value)) {
    return value.toLowerCase();
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
      // Fall through to return original value
      console.warn('Failed to decode npub/nprofile:', error);
    }
  }

  return value;
}

/**
 * Normalize an event ID that might be hex or note
 */
function normalizeEventId(value: string): string {
  // If it looks like a hex event ID (64 chars), return as-is
  if (/^[0-9a-f]{64}$/i.test(value)) {
    return value.toLowerCase();
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
      // Fall through to return original value
      console.warn('Failed to decode note/nevent:', error);
    }
  }

  return value;
}

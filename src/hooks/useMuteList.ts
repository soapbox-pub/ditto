import { useNostr } from '@nostrify/react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';

import { useCurrentUser } from './useCurrentUser';
import { useNostrPublish } from './useNostrPublish';

export interface MuteListItem {
  type: 'pubkey' | 'hashtag' | 'word' | 'thread';
  value: string;
  isPrivate: boolean;
}

/**
 * Hook to manage NIP-51 mute lists (kind 10000)
 * Supports both public and encrypted private mute items
 */
export function useMuteList() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();
  const { mutateAsync: publishEvent } = useNostrPublish();

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
  });

  // Parse mute list into structured items
  const muteItems = useQuery({
    queryKey: ['muteItems', query.data?.id],
    queryFn: async () => {
      const event = query.data;
      if (!event || !user) return [];

      const items: MuteListItem[] = [];

      // Parse public items from tags
      for (const tag of event.tags) {
        const [tagName, value] = tag;
        if (!value) continue;

        switch (tagName) {
          case 'p':
            items.push({ type: 'pubkey', value, isPrivate: false });
            break;
          case 't':
            items.push({ type: 'hashtag', value, isPrivate: false });
            break;
          case 'word':
            items.push({ type: 'word', value, isPrivate: false });
            break;
          case 'e':
            items.push({ type: 'thread', value, isPrivate: false });
            break;
        }
      }

      // Parse encrypted private items from content
      if (event.content && user.signer.nip44) {
        try {
          const decrypted = await user.signer.nip44.decrypt(user.pubkey, event.content);
          const privateTags = JSON.parse(decrypted) as string[][];

          for (const tag of privateTags) {
            const [tagName, value] = tag;
            if (!value) continue;

            switch (tagName) {
              case 'p':
                items.push({ type: 'pubkey', value, isPrivate: true });
                break;
              case 't':
                items.push({ type: 'hashtag', value, isPrivate: true });
                break;
              case 'word':
                items.push({ type: 'word', value, isPrivate: true });
                break;
              case 'e':
                items.push({ type: 'thread', value, isPrivate: true });
                break;
            }
          }
        } catch (error) {
          console.error('Failed to decrypt private mute items:', error);
        }
      }

      return items;
    },
    enabled: !!query.data && !!user,
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

      const currentItems = muteItems.data || [];
      const newItems = [...currentItems, { ...item, value: normalizedValue }];

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

      const currentItems = muteItems.data || [];
      const newItems = currentItems.filter(
        (i) => !(i.type === item.type && i.value === item.value && i.isPrivate === item.isPrivate)
      );

      await updateMuteList(newItems);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['muteList', user?.pubkey] });
    },
  });

  // Update entire mute list
  const updateMuteList = async (items: MuteListItem[]) => {
    if (!user) throw new Error('User not logged in');

    const publicTags: string[][] = [];
    const privateTags: string[][] = [];

    for (const item of items) {
      const tag = [
        item.type === 'pubkey' ? 'p' :
        item.type === 'hashtag' ? 't' :
        item.type === 'word' ? 'word' :
        'e',
        item.value,
      ];

      if (item.isPrivate) {
        privateTags.push(tag);
      } else {
        publicTags.push(tag);
      }
    }

    // Encrypt private tags if NIP-44 is available
    let content = '';
    if (privateTags.length > 0 && user.signer.nip44) {
      const plaintext = JSON.stringify(privateTags);
      content = await user.signer.nip44.encrypt(user.pubkey, plaintext);
    }

    await publishEvent({
      kind: 10000,
      content,
      tags: publicTags,
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

import { useNostr } from '@nostrify/react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { NostrFilter } from '@nostrify/nostrify';

import { useCurrentUser } from './useCurrentUser';
import { useNostrPublish } from './useNostrPublish';
import type { Theme, FeedSettings } from '@/contexts/AppContext';
import type { ContentFilter } from './useContentFilters';

const SETTINGS_D_TAG = 'mew-settings';

/**
 * Complete encrypted app settings stored in NIP-78
 */
export interface EncryptedSettings {
  /** App theme preference */
  theme?: Theme;
  /** Whether to use app default relays in addition to user relays */
  useAppRelays?: boolean;
  /** Feed and sidebar content settings */
  feedSettings?: FeedSettings;
  /** Advanced content filters */
  contentFilters?: ContentFilter[];
  /** Last sync timestamp */
  lastSync?: number;
}

/**
 * Hook to manage all encrypted app settings using NIP-78 (kind 30078)
 * Syncs settings across devices while keeping them private
 */
export function useEncryptedSettings() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();
  const { mutateAsync: publishEvent } = useNostrPublish();

  // Query the encrypted settings event
  const query = useQuery({
    queryKey: ['encryptedSettings', user?.pubkey],
    queryFn: async () => {
      if (!user) return null;

      const filter: NostrFilter = {
        kinds: [30078],
        authors: [user.pubkey],
        '#d': [SETTINGS_D_TAG],
        limit: 1,
      };

      const events = await nostr.query([filter]);
      if (events.length === 0) return null;

      return events[0];
    },
    enabled: !!user,
    staleTime: 30000, // 30 seconds
  });

  // Parse settings from encrypted content
  const settings = useQuery({
    queryKey: ['parsedSettings', query.data?.id],
    queryFn: async () => {
      const event = query.data;
      if (!event || !user) return null;

      // Decrypt the content
      if (!event.content || !user.signer.nip44) {
        return null;
      }

      try {
        const decrypted = await user.signer.nip44.decrypt(user.pubkey, event.content);
        const parsed = JSON.parse(decrypted) as EncryptedSettings;
        return parsed;
      } catch (error) {
        console.error('Failed to decrypt settings:', error);
        return null;
      }
    },
    enabled: !!query.data && !!user,
    staleTime: 30000,
  });

  // Update settings
  const updateSettings = useMutation({
    mutationFn: async (patch: Partial<EncryptedSettings>) => {
      if (!user) throw new Error('User not logged in');
      if (!user.signer.nip44) throw new Error('NIP-44 encryption not supported by signer');

      const currentSettings = settings.data || {};
      const updatedSettings: EncryptedSettings = {
        ...currentSettings,
        ...patch,
        lastSync: Date.now(),
      };

      // Encrypt the settings
      const plaintext = JSON.stringify(updatedSettings);
      const encrypted = await user.signer.nip44.encrypt(user.pubkey, plaintext);

      await publishEvent({
        kind: 30078,
        content: encrypted,
        tags: [
          ['d', SETTINGS_D_TAG],
          ['title', 'Mew Settings'],
        ],
      });

      return updatedSettings;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['encryptedSettings', user?.pubkey] });
    },
  });

  // Initialize settings if they don't exist
  const initializeSettings = async (initialSettings: Partial<EncryptedSettings>) => {
    if (settings.data !== null || !user?.signer.nip44) {
      return; // Already initialized or no encryption support
    }

    try {
      await updateSettings.mutateAsync(initialSettings);
    } catch (error) {
      console.warn('Failed to initialize encrypted settings:', error);
    }
  };

  return {
    settings: settings.data,
    isLoading: query.isLoading || settings.isLoading,
    isError: query.isError || settings.isError,
    error: query.error || settings.error,
    updateSettings,
    initializeSettings,
    hasNip44Support: !!user?.signer.nip44,
    lastSync: settings.data?.lastSync,
  };
}

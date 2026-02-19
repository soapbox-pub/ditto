import { useNostr } from '@nostrify/react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { NostrFilter } from '@nostrify/nostrify';

import { useCurrentUser } from './useCurrentUser';
import type { Theme, FeedSettings } from '@/contexts/AppContext';
import type { ContentFilter } from './useContentFilters';

const SETTINGS_D_TAG = 'mew-settings';

/**
 * Timestamp of last local write. NostrSync should skip applying
 * encrypted settings for a short window after a local write to
 * avoid overwriting the value we just set.
 */
let lastWriteTs = 0;

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
  /** Timestamp of last viewed notification (Unix timestamp in seconds) */
  notificationsCursor?: number;
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
    staleTime: 30 * 60 * 1000, // 30 minutes - refetch on page load after this
    gcTime: 60 * 60 * 1000, // 1 hour - keep in cache
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
    staleTime: 30 * 60 * 1000, // 30 minutes
    gcTime: 60 * 60 * 1000, // 1 hour - keep in cache
    refetchOnWindowFocus: false, // Don't refetch on window focus to avoid spam
    refetchOnReconnect: false, // Don't refetch on reconnect
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

      // Sign the event
      const unsignedEvent = {
        kind: 30078,
        content: encrypted,
        tags: [
          ['d', SETTINGS_D_TAG],
          ['title', 'Mew Settings'],
          ['client', location.hostname],
        ],
        created_at: Math.floor(Date.now() / 1000),
      };

      const signedEvent = await user.signer.signEvent(unsignedEvent);

      // Mark that we just wrote, so NostrSync doesn't fight us
      lastWriteTs = Date.now();

      // Publish in background
      nostr.event(signedEvent, { signal: AbortSignal.timeout(5000) }).catch((error) => {
        console.error('Failed to publish encrypted settings:', error);
      });

      return updatedSettings;
    },
    // Update cache in-place instead of refetching, which avoids
    // NostrSync re-running and causing a re-render loop
    onSuccess: (data) => {
      queryClient.setQueryData(['parsedSettings', query.data?.id], data);
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
    /** True if a local write happened recently. NostrSync should skip applying. */
    recentlyWritten: () => Date.now() - lastWriteTs < 10_000,
  };
}

import { useEffect, useRef } from 'react';
import { useNostr } from '@nostrify/react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAppContext } from '@/hooks/useAppContext';
import { useEncryptedSettings } from '@/hooks/useEncryptedSettings';

/**
 * NostrSync - Syncs user's Nostr data
 *
 * This component runs globally to sync various Nostr data when the user logs in.
 * Currently syncs:
 * - NIP-65 relay list (kind 10002)
 * - Encrypted app settings (kind 30078) - theme, feed settings, relay toggle
 */
export function NostrSync() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { config, updateConfig } = useAppContext();
  const { settings: encryptedSettings, isLoading: settingsLoading, recentlyWritten } = useEncryptedSettings();
  
  // Track the last synced settings timestamp to prevent re-syncing the same data
  const lastSyncedTimestamp = useRef<number>(0);

  useEffect(() => {
    if (!user) return;

    const syncRelaysFromNostr = async () => {
      try {
        const events = await nostr.query(
          [{ kinds: [10002], authors: [user.pubkey], limit: 1 }],
          { signal: AbortSignal.timeout(5000) }
        );

        if (events.length > 0) {
          const event = events[0];

          // Only update if the event is newer than our stored data
          if (event.created_at > config.relayMetadata.updatedAt) {
            const fetchedRelays = event.tags
              .filter(([name]) => name === 'r')
              .map(([_, url, marker]) => ({
                url: url.replace(/\/+$/, ''),
                read: !marker || marker === 'read',
                write: !marker || marker === 'write',
              }));

            if (fetchedRelays.length > 0) {
              console.log('Syncing relay list from Nostr:', fetchedRelays);
              updateConfig((current) => ({
                ...current,
                relayMetadata: {
                  relays: fetchedRelays,
                  updatedAt: event.created_at,
                },
              }));
            }
          }
        }
      } catch (error) {
        console.error('Failed to sync relays from Nostr:', error);
      }
    };

    syncRelaysFromNostr();
  }, [user, config.relayMetadata.updatedAt, nostr, updateConfig]);

  // Sync encrypted settings from Nostr on login
  useEffect(() => {
    if (!user || settingsLoading || !encryptedSettings) return;

    // Don't overwrite local config if we just saved settings
    if (recentlyWritten()) {
      console.log('Skipping settings sync - recent write');
      return;
    }

    // Get the remote sync timestamp
    const remoteSync = encryptedSettings.lastSync || 0;
    
    // Only sync if we haven't already synced this exact timestamp
    if (remoteSync <= lastSyncedTimestamp.current) {
      return;
    }

    console.log('Syncing encrypted settings from Nostr', remoteSync);
    lastSyncedTimestamp.current = remoteSync;

    // Update local config with encrypted settings if they exist
    updateConfig((current) => {
      const updates: any = { ...current };

      // Sync theme if available
      if (encryptedSettings.theme && encryptedSettings.theme !== current.theme) {
        updates.theme = encryptedSettings.theme;
      }

      // Sync useAppRelays if available
      if (encryptedSettings.useAppRelays !== undefined && encryptedSettings.useAppRelays !== current.useAppRelays) {
        updates.useAppRelays = encryptedSettings.useAppRelays;
      }

      // Sync feedSettings if available
      if (encryptedSettings.feedSettings) {
        updates.feedSettings = {
          ...current.feedSettings,
          ...encryptedSettings.feedSettings,
        };
      }

      return updates;
    });
  }, [user, encryptedSettings, settingsLoading, updateConfig, recentlyWritten]);

  return null;
}
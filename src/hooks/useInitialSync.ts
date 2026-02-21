import { useState, useEffect, useRef, useCallback } from 'react';
import { useNostr } from '@nostrify/react';
import { useQueryClient } from '@tanstack/react-query';
import { useCurrentUser } from './useCurrentUser';
import { useAppContext } from './useAppContext';
import type { EncryptedSettings } from './useEncryptedSettings';

export type SyncPhase =
  | 'idle'         // No user logged in
  | 'syncing'      // Actively fetching settings from relays
  | 'found'        // Settings were found and applied, ready to proceed
  | 'not-found'    // No settings found, show questionnaire
  | 'complete';    // Sync + setup complete, show the app

const SYNC_TIMEOUT_MS = 8000;

/**
 * Hook to manage the initial sync flow when a user logs in on a new device.
 *
 * - While logged out: phase = 'idle'
 * - On login: phase = 'syncing' (fetch relay list + encrypted settings)
 * - If settings found: decrypt, apply to config, seed query cache, then
 *   phase = 'found' -> auto-transitions to 'complete'
 * - If no settings found: phase = 'not-found' (show questionnaire)
 * - After questionnaire: markComplete() -> phase = 'complete'
 *
 * Uses a sessionStorage flag so the sync screen only shows once per
 * browser session (not on every page refresh while logged in).
 */
export function useInitialSync() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { config, updateConfig } = useAppContext();
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<SyncPhase>('idle');
  const syncAttempted = useRef(false);

  // Check if sync was already completed this session
  const isCompletedThisSession = useCallback(() => {
    if (!user) return false;
    try {
      return sessionStorage.getItem(`mew:sync-done:${user.pubkey}`) === '1';
    } catch {
      return false;
    }
  }, [user]);

  const markSessionComplete = useCallback(() => {
    if (!user) return;
    try {
      sessionStorage.setItem(`mew:sync-done:${user.pubkey}`, '1');
    } catch {
      // sessionStorage may not be available
    }
  }, [user]);

  // Reset when user changes
  useEffect(() => {
    if (!user) {
      setPhase('idle');
      syncAttempted.current = false;
      return;
    }

    // Skip sync if already completed this session
    if (isCompletedThisSession()) {
      setPhase('complete');
      return;
    }

    // Don't re-run if we already attempted for this user
    if (syncAttempted.current) return;
    syncAttempted.current = true;

    setPhase('syncing');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS);

    const doSync = async () => {
      let foundSettings = false;

      try {
        // Fetch relay list and encrypted settings in parallel
        const [relayEvents, settingsEvents] = await Promise.all([
          nostr.query(
            [{ kinds: [10002], authors: [user.pubkey], limit: 1 }],
            { signal: controller.signal },
          ).catch(() => []),
          nostr.query(
            [{ kinds: [30078], authors: [user.pubkey], '#d': ['mew-metadata'], limit: 1 }],
            { signal: controller.signal },
          ).catch(() => []),
        ]);

        // Apply relay list if found
        if (relayEvents.length > 0) {
          const event = relayEvents[0];
          if (event.created_at > config.relayMetadata.updatedAt) {
            const fetchedRelays = event.tags
              .filter(([name]) => name === 'r')
              .map(([, url, marker]) => ({
                url: url.replace(/\/+$/, ''),
                read: !marker || marker === 'read',
                write: !marker || marker === 'write',
              }));

            if (fetchedRelays.length > 0) {
              updateConfig((current) => ({
                ...current,
                relayMetadata: {
                  relays: fetchedRelays,
                  updatedAt: event.created_at,
                },
              }));
              foundSettings = true;
            }
          }
        }

        // Decrypt and apply encrypted settings if found
        if (settingsEvents.length > 0 && settingsEvents[0].content && user.signer.nip44) {
          const settingsEvent = settingsEvents[0];

          try {
            const decrypted = await user.signer.nip44.decrypt(user.pubkey, settingsEvent.content);
            const parsed = JSON.parse(decrypted) as EncryptedSettings;

            // Apply decrypted settings to local config (same logic as NostrSync)
            updateConfig((current) => {
              const updates = { ...current };

              if (parsed.theme) {
                updates.theme = parsed.theme;
              }
              if (parsed.useAppRelays !== undefined) {
                updates.useAppRelays = parsed.useAppRelays;
              }
              if (parsed.feedSettings) {
                updates.feedSettings = { ...current.feedSettings, ...parsed.feedSettings };
              }
              if (parsed.contentWarningPolicy) {
                updates.contentWarningPolicy = parsed.contentWarningPolicy;
              }

              return updates;
            });

            // Seed the TanStack query cache so useEncryptedSettings doesn't
            // re-fetch the same data and NostrSync sees it immediately.
            queryClient.setQueryData(['encryptedSettings', user.pubkey], settingsEvent);
            queryClient.setQueryData(['parsedSettings', settingsEvent.id], parsed);

            foundSettings = true;
          } catch (error) {
            console.error('Failed to decrypt settings during initial sync:', error);
            // Still count the event as found — NostrSync will retry decryption later
            foundSettings = true;
          }
        }
      } catch (error) {
        // On timeout or error, treat as not found so the user can still proceed
        if (error instanceof Error && error.name === 'AbortError') {
          console.warn('Initial sync timed out');
        } else {
          console.error('Initial sync failed:', error);
        }
      }

      clearTimeout(timeout);

      if (foundSettings) {
        setPhase('found');
        // Auto-complete after a brief moment so user sees the success state
        setTimeout(() => {
          markSessionComplete();
          setPhase('complete');
        }, 1200);
      } else {
        setPhase('not-found');
      }
    };

    doSync();

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [user, nostr, config.relayMetadata.updatedAt, updateConfig, queryClient, isCompletedThisSession, markSessionComplete]);

  const markComplete = useCallback(() => {
    markSessionComplete();
    setPhase('complete');
  }, [markSessionComplete]);

  return { phase, markComplete };
}

import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

import { useCurrentUser } from './useCurrentUser';
import { useAppContext } from './useAppContext';
import { getEffectiveRelays } from '@/lib/appRelays';
import {
  fetchNewNotifications,
  dispatchNativeNotifications,
  getLastSeenTimestamp,
  setLastSeenTimestamp,
  startBackgroundPoll,
  stopBackgroundPoll,
} from '@/lib/notificationService';

/** Check (and request if needed) notification permission. */
async function ensurePermission(): Promise<boolean> {
  try {
    let { display } = await LocalNotifications.checkPermissions();
    if (display === 'prompt' || display === 'prompt-with-rationale') {
      const result = await LocalNotifications.requestPermissions();
      display = result.display;
    }
    return display === 'granted';
  } catch {
    return false;
  }
}

/**
 * Hook that manages native device notifications for the Nostr app.
 */
export function useNativeNotifications(): void {
  const { user } = useCurrentUser();
  const { config } = useAppContext();
  const initialized = useRef(false);

  // Request notification permission on mount
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    ensurePermission();
  }, []);

  // Set up foreground polling + background polling
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    if (!user) {
      stopBackgroundPoll();
      initialized.current = false;
      return;
    }

    const effectiveRelays = getEffectiveRelays(config.relayMetadata, config.useAppRelays);
    const relayUrls = effectiveRelays.relays
      .filter((r) => r.read)
      .map((r) => r.url);

    if (relayUrls.length === 0) return;

    // Initialize last-seen timestamp on first run so we don't blast old notifications
    if (!initialized.current) {
      const stored = getLastSeenTimestamp();
      if (stored === 0) {
        // First time: set to 5 minutes ago so we catch very recent interactions
        setLastSeenTimestamp(Math.floor(Date.now() / 1000) - 300);
      }
      initialized.current = true;
    }

    // Start the 15-minute background poll
    startBackgroundPoll(relayUrls, user.pubkey);

    // Foreground polling: check every 60 seconds + an initial check after 10s
    const pollRelays = async () => {
      // Check permission each time to avoid race with the initial async request
      const granted = await ensurePermission();
      if (!granted) return;

      try {
        const since = getLastSeenTimestamp();
        const events = await fetchNewNotifications(relayUrls, user.pubkey, since);
        if (events.length > 0) {
          await dispatchNativeNotifications(events, relayUrls);
          const newestTs = Math.max(...events.map((e) => e.created_at));
          setLastSeenTimestamp(newestTs);
        }
      } catch (error) {
        console.warn('[NativeNotifications] Poll failed:', error);
      }
    };

    // Initial check after 10 seconds
    const immediateCheck = setTimeout(pollRelays, 10_000);

    // Then poll every 60 seconds
    const foregroundInterval = setInterval(pollRelays, 60_000);

    return () => {
      clearTimeout(immediateCheck);
      clearInterval(foregroundInterval);
      stopBackgroundPoll();
    };
  }, [user, config.relayMetadata, config.useAppRelays]);

  // Listen for notification taps to navigate into the app
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const listener = LocalNotifications.addListener(
      'localNotificationActionPerformed',
      (_notification) => {
        window.location.hash = '';
        window.location.pathname = '/notifications';
      },
    );

    return () => {
      listener.then((l) => l.remove());
    };
  }, []);
}

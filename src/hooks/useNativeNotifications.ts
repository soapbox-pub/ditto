import { useEffect } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

import { useCurrentUser } from './useCurrentUser';
import { useAppContext } from './useAppContext';
import { getEffectiveRelays } from '@/lib/appRelays';

/** Interface for the native MewNotification Capacitor plugin. */
interface MewNotificationPlugin {
  configure(options: { userPubkey?: string; relayUrls?: string[] }): Promise<void>;
}

const MewNotification = registerPlugin<MewNotificationPlugin>('MewNotification');

/**
 * Hook that manages native device notifications for the Nostr app.
 *
 * On login: passes the user's pubkey and relay URLs to the native Android
 * notification service, which polls relays every 60 seconds via AlarmManager
 * using pure Java WebSocket connections. No WebView involvement for background polling.
 *
 * On logout: clears the native config so polling stops.
 */
export function useNativeNotifications(): void {
  const { user } = useCurrentUser();
  const { config } = useAppContext();

  // Request notification permission on mount
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    (async () => {
      try {
        const { display } = await LocalNotifications.checkPermissions();
        if (display === 'prompt' || display === 'prompt-with-rationale') {
          await LocalNotifications.requestPermissions();
        }
      } catch {
        // Permission check failed
      }
    })();
  }, []);

  // Pass user config to native polling service
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    if (!user) {
      // User logged out -- clear native config
      MewNotification.configure({});
      return;
    }

    const effectiveRelays = getEffectiveRelays(config.relayMetadata, config.useAppRelays);
    const relayUrls = effectiveRelays.relays
      .filter((r) => r.read)
      .map((r) => r.url);

    if (relayUrls.length === 0) return;

    // Configure the native service with current user + relays
    MewNotification.configure({
      userPubkey: user.pubkey,
      relayUrls,
    });
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

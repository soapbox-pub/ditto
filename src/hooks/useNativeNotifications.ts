import { useEffect } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

import { useCurrentUser } from './useCurrentUser';
import { useAppContext } from './useAppContext';
import { getEffectiveRelays } from '@/lib/appRelays';

/** Interface for the native DittoNotification Capacitor plugin. */
interface DittoNotificationPlugin {
  configure(options: { userPubkey?: string; relayUrls?: string[] }): Promise<void>;
}

const DittoNotification = registerPlugin<DittoNotificationPlugin>('DittoNotification');

/**
 * Hook that manages native device notifications for the Nostr app.
 *
 * On login: passes the user's pubkey and relay URLs to the native Android
 * notification service, which maintains a persistent WebSocket subscription
 * to a Nostr relay for real-time event delivery. No WebView involvement
 * for background notifications.
 *
 * On logout: clears the native config so the relay connection is closed.
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
      DittoNotification.configure({});
      return;
    }

    const effectiveRelays = getEffectiveRelays(config.relayMetadata, config.useAppRelays);
    const relayUrls = effectiveRelays.relays
      .filter((r) => r.read)
      .map((r) => r.url);

    if (relayUrls.length === 0) return;

    // Configure the native service with current user + relays
    DittoNotification.configure({
      userPubkey: user.pubkey,
      relayUrls,
    });
  }, [user, config.relayMetadata, config.useAppRelays]);

}

import { useEffect } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

import { useCurrentUser } from './useCurrentUser';
import { useAppContext } from './useAppContext';
import { useEncryptedSettings } from './useEncryptedSettings';
import { usePushNotifications } from './usePushNotifications';
import { getEffectiveRelays } from '@/lib/appRelays';

/** Interface for the native DittoNotification Capacitor plugin. */
interface DittoNotificationPlugin {
  configure(options: { userPubkey?: string; relayUrls?: string[] }): Promise<void>;
}

const DittoNotification = registerPlugin<DittoNotificationPlugin>('DittoNotification');

/**
 * Hook that manages device/browser notifications for the Nostr app.
 *
 * Capacitor (native): passes user pubkey + relay URLs to the native Android
 * notification service. Defaults to on. Respects the user's notificationsEnabled setting.
 *
 * Web/PWA: handles only the disable path — unregisters from nostr-push when
 * the user turns off notifications or logs out. The enable path is triggered
 * exclusively from NotificationSettings.tsx (a user gesture / click handler)
 * because iOS requires Notification.requestPermission() to be called from
 * a direct user interaction.
 */
export function useNativeNotifications(): void {
  const { user } = useCurrentUser();
  const { config } = useAppContext();
  const { settings } = useEncryptedSettings();
  const { supported: pushSupported, enabled: pushEnabled, disable: disablePush } = usePushNotifications();

  // Web defaults to false (opt-in); native defaults to true (foreground service).
  const notificationsEnabled = settings?.notificationsEnabled ?? Capacitor.isNativePlatform();

  // ── Capacitor path ────────────────────────────────────────────────────────

  // Request native notification permission on first mount (native only).
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    (async () => {
      try {
        const { display } = await LocalNotifications.checkPermissions();
        if (display === 'prompt' || display === 'prompt-with-rationale') {
          await LocalNotifications.requestPermissions();
        }
      } catch {
        // Permission check failed — ignore
      }
    })();
  }, []);

  // Configure / deconfigure the native polling service.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    if (!user || !notificationsEnabled) {
      // Logged out or user disabled notifications — stop the native service.
      DittoNotification.configure({});
      return;
    }

    const effectiveRelays = getEffectiveRelays(config.relayMetadata, config.useAppRelays);
    const relayUrls = effectiveRelays.relays
      .filter((r) => r.read)
      .map((r) => r.url);

    if (relayUrls.length === 0) return;

    DittoNotification.configure({
      userPubkey: user.pubkey,
      relayUrls,
    });
  }, [user, config.relayMetadata, config.useAppRelays, notificationsEnabled]);

  // ── Web Push path (nostr-push) — disable only ─────────────────────────────
  // Enable is handled by NotificationSettings.tsx click handler.

  useEffect(() => {
    if (Capacitor.isNativePlatform()) return;
    if (!pushSupported) return;

    // User logged out or disabled notifications — unregister from nostr-push.
    if ((!user || !notificationsEnabled) && pushEnabled) {
      disablePush().catch((err) => console.error('[push] Failed to disable:', err));
    }
  }, [user, notificationsEnabled, pushSupported, pushEnabled]);
}

import { useEffect, useMemo } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

import { useCurrentUser } from './useCurrentUser';
import { useAppContext } from './useAppContext';
import { useEncryptedSettings } from './useEncryptedSettings';
import { useFollowList } from './useFollowActions';
import { getEffectiveRelays } from '@/lib/appRelays';
import { getEnabledNotificationKinds } from '@/lib/notificationKinds';

/** Interface for the native DittoNotification Capacitor plugin. */
interface DittoNotificationPlugin {
  configure(options: { userPubkey?: string; relayUrls?: string[]; enabledKinds?: number[]; authors?: string[]; notificationStyle?: string }): Promise<void>;
}

const DittoNotification = registerPlugin<DittoNotificationPlugin>('DittoNotification');

/**
 * Manages the native Android notification service via Capacitor.
 *
 * Passes user pubkey + relay URLs + enabled notification kinds + optional
 * authors filter to the DittoNotification plugin so it can poll for events
 * in the background. Respects the NIP-78 notificationsEnabled setting
 * (defaults to on), per-type notification preferences, and the "only from
 * people I follow" setting.
 *
 * Web Push (nostr-push) is handled separately by usePushNotifications +
 * NotificationSettings — this hook is Capacitor-only.
 */
export function useNativeNotifications(): void {
  const { user } = useCurrentUser();
  const { config } = useAppContext();
  const { settings } = useEncryptedSettings();
  const { data: followData } = useFollowList();

  const prefs = settings?.notificationPreferences;
  const notificationsEnabled = settings?.notificationsEnabled ?? true;
  const notificationStyle = settings?.notificationStyle ?? 'push';
  const enabledKinds = useMemo(
    () => getEnabledNotificationKinds(prefs),
    [prefs],
  );

  // Authors filter: when onlyFollowing is set, restrict to followed pubkeys
  const followedPubkeys = useMemo(
    () => followData?.pubkeys ?? [],
    [followData?.pubkeys],
  );
  const onlyFollowing = prefs?.onlyFollowing === true;
  const authorsFilter = onlyFollowing && followedPubkeys.length > 0
    ? followedPubkeys
    : undefined;

  // Request native notification permission on first mount.
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
      DittoNotification.configure({});
      return;
    }

    const effectiveRelays = getEffectiveRelays(config.relayMetadata, config.useAppRelays, config.useUserRelays);
    const relayUrls = effectiveRelays.relays
      .filter((r) => r.read)
      .map((r) => r.url);

    if (relayUrls.length === 0) return;

    DittoNotification.configure({
      userPubkey: user.pubkey,
      relayUrls,
      enabledKinds,
      notificationStyle,
      ...(authorsFilter ? { authors: authorsFilter } : {}),
    });
  }, [user, config.relayMetadata, config.useAppRelays, config.useUserRelays, notificationsEnabled, notificationStyle, enabledKinds, authorsFilter]);
}

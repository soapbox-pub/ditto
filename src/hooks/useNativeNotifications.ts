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
  /** Android: whether the app is exempt from battery optimizations (Doze). */
  isIgnoringBatteryOptimizations(): Promise<{ ignoring: boolean }>;
  /**
   * Android: show the one-tap system dialog to grant the exemption.
   * Resolves when the dialog closes, with the fresh exemption state.
   */
  requestIgnoreBatteryOptimizations(): Promise<{ ignoring: boolean }>;
}

const DittoNotification = registerPlugin<DittoNotificationPlugin>('DittoNotification');

/**
 * Check whether Ditto is exempt from Android battery optimizations.
 *
 * Battery optimization delays the background fetch alarms that drive
 * "persistent" notification mode, and on Android 15+ the exemption is also
 * required to restart the foreground service after a reboot.
 *
 * Returns `true` (exempt / nothing to do) on non-Android platforms or when
 * the native method is unavailable (older app binary), so callers never show
 * a false warning.
 */
export async function isIgnoringBatteryOptimizations(): Promise<boolean> {
  if (Capacitor.getPlatform() !== 'android') return true;
  try {
    const { ignoring } = await DittoNotification.isIgnoringBatteryOptimizations();
    return ignoring;
  } catch {
    return true;
  }
}

/**
 * Open the one-tap system dialog asking the user to exempt Ditto from
 * battery optimizations. Resolves once the dialog closes, returning the
 * fresh exemption state (`true` = exempt) so callers can update their UI
 * immediately — the dialog overlays the WebView without hiding it, so no
 * visibilitychange event fires when it closes. No-op outside Android.
 */
export async function requestIgnoreBatteryOptimizations(): Promise<boolean> {
  if (Capacitor.getPlatform() !== 'android') return true;
  try {
    const { ignoring } = await DittoNotification.requestIgnoreBatteryOptimizations();
    return ignoring;
  } catch (err) {
    console.error('[notifications] Failed to request battery optimization exemption:', err);
    // The request may still have opened a settings screen — re-check.
    return isIgnoringBatteryOptimizations();
  }
}

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

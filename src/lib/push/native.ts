/**
 * The native `DittoNotification` Capacitor plugin, and the push host over it.
 *
 * In the Capacitor apps the plugin is the napp host: it takes the same
 * `NappSubscription[]` Tenna and the nostr-push service do and keeps them
 * watched while Ditto is closed. Android holds them open as `REQ`s from a
 * foreground service ("persistent") or polls them from WorkManager ("push");
 * iOS polls them from background refresh. Matches are rendered natively
 * (`NostrPoller.java`, `NostrPoller.swift`) rather than by `public/sw.js`.
 */

import { Capacitor, registerPlugin } from '@capacitor/core';

import type { NappSubscription } from '@/lib/push/napp';
import type { PushHost, PushSetOptions } from '@/lib/push/types';

interface SetSubscriptionsOptions {
  /** The filters to watch. An empty list stops watching. */
  subscriptions: NappSubscription[];
  /** Hex pubkey of the logged-in user. Their own events are never shown. */
  userPubkey?: string;
  /**
   * The full follow set. Used for the "only from people I follow" re-check
   * when the filters had to go without `authors`, and for the spam detectors'
   * trust exemption — a followed author's copy of a pitch is never folded.
   */
  follows?: string[];
  /** Whether to drop events from authors outside `follows`. */
  onlyFollowing?: boolean;
  /** 'persistent' holds relay connections open on Android; 'push' polls. */
  notificationStyle?: 'push' | 'persistent';
}

interface DittoNotificationPlugin {
  /** Replace the watched subscriptions, and the state the renderer needs. */
  setSubscriptions(options: SetSubscriptionsOptions): Promise<void>;
  /** The subscriptions as stored. */
  getSubscriptions(): Promise<{ subscriptions: NappSubscription[] }>;
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
 * Battery optimization can cut the background relay connection that drives
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

export class NativeHost implements PushHost {
  readonly transport = 'native' as const;
  readonly supported = Capacitor.isNativePlatform();
  /**
   * The OS permission is asked by the post-login setup flow (LoginSetup),
   * which explains what it's for first, and by the settings toggle.
   */
  readonly needsBrowserPermission = false;
  readonly usesServiceWorker = false;
  readonly followsSyncedSetting = true;

  async init(): Promise<boolean> {
    try {
      const { subscriptions } = await DittoNotification.getSubscriptions();
      return subscriptions.length > 0;
    } catch (err) {
      console.warn('[push] Failed to read native subscriptions:', err);
      return false;
    }
  }

  async requestPermission(): Promise<NotificationPermission> {
    return 'granted';
  }

  async set(subscriptions: NappSubscription[], { context }: PushSetOptions): Promise<void> {
    await DittoNotification.setSubscriptions({
      subscriptions,
      userPubkey: context.pubkey,
      follows: context.follows ?? [],
      onlyFollowing: context.prefs?.onlyFollowing === true,
      notificationStyle: context.style ?? 'push',
    });
  }

  async clear(): Promise<void> {
    await DittoNotification.setSubscriptions({ subscriptions: [] });
  }

  destroy(): void {}
}

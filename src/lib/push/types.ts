/**
 * Push transport interface.
 *
 * Ditto notifies while closed in one way with three transports. The page builds
 * one set of subscriptions in napp's shape (`buildPushSubscriptions()`), hands
 * it to a `PushHost`, and the host keeps those filters watched and turns each
 * match into a notification:
 *
 * - **napp** — `window.napp.push`, injected by a host app (Tenna). Tenna holds
 *   the relay subscriptions itself on Android and hands them to a push service
 *   on iOS; either way the raw event reaches `public/sw.js`.
 * - **nostr-push** — the web. The nostr-push service takes the same
 *   subscriptions over encrypted RPC and delivers the same raw-event payload
 *   through Web Push to the same `public/sw.js`.
 * - **native** — the Capacitor apps. The `DittoNotification` plugin takes the
 *   same subscriptions; Android holds them open in a foreground service, iOS
 *   polls them from background refresh, and each renders natively.
 *
 * `PushAdapter` wraps any host, so `usePushNotifications` — and the settings
 * UI above it — never branches on which one is in play. Pick one with
 * `createPushAdapter()`.
 */

import type { EncryptedSettings } from '@/hooks/useEncryptedSettings';
import type { NappSubscription } from '@/lib/push/napp';

/** Per-type notification preferences, as persisted in encrypted settings. */
export type PushPreferences = NonNullable<EncryptedSettings['notificationPreferences']>;

/** Which transport a host speaks. Exposed for logging and diagnostics. */
export type PushTransport = 'napp' | 'nostr-push' | 'native';

/** Everything needed to build (or rebuild) the subscriptions. */
export interface PushContext {
  /** Hex pubkey of the logged-in user. Notifications are events tagging them. */
  pubkey: string;
  /** Per-type preferences. Absent means "everything, on". */
  prefs?: PushPreferences;
  /** Read relays to watch. */
  relays?: string[];
  /** The user's follow set, for "only from people I follow" and spam exemptions. */
  follows?: string[];
  /** Native only: 'persistent' holds a relay connection open on Android. */
  style?: 'push' | 'persistent';
}

/** What the adapter hands a host alongside the subscriptions. */
export interface PushSetOptions {
  context: PushContext;
  /**
   * Settles once the service worker's copy of the state is written. A host
   * that can deliver a push the moment `set()` returns must await it first;
   * one that has to reach a browser API from the user gesture awaits it after.
   */
  workerReady: Promise<void>;
}

/**
 * One transport. Everything above it deals in `NappSubscription[]`; a host
 * only has to get those watched and the matches delivered.
 */
export interface PushHost {
  readonly transport: PushTransport;
  /** Whether this transport can run at all in the current environment. */
  readonly supported: boolean;
  /**
   * Whether the caller must prompt for the browser's notification permission
   * before `set()`. False when consent belongs to the host app (napp) or to
   * the post-login setup flow (native).
   */
  readonly needsBrowserPermission: boolean;
  /** Whether matches are rendered by `public/sw.js`, which needs its state written. */
  readonly usesServiceWorker: boolean;
  /**
   * Whether on/off follows the synced `notificationsEnabled` setting instead
   * of this device's own registration. True for the native apps, where the
   * OS permission is asked at login and push is on unless switched off.
   */
  readonly followsSyncedSetting: boolean;
  /**
   * One-time bring-up: register the service worker, restore prior state, and
   * pre-compute anything `set()` must not await. Resolves with whether the
   * host already holds subscriptions, and never rejects.
   */
  init(): Promise<boolean>;
  /**
   * Ask for whatever consent this transport requires. Must be reachable from a
   * user gesture. `'granted'` for transports that prompt elsewhere.
   */
  requestPermission(): Promise<NotificationPermission>;
  /** Replace the watched subscriptions. An empty list watches nothing. */
  set(subscriptions: NappSubscription[], options: PushSetOptions): Promise<void>;
  /** Forget everything: subscriptions, and any registration behind them. */
  clear(): Promise<void>;
  /**
   * Called on a regular cadence while enabled, for hosts whose registration
   * expires. Resolves true when the registration had lapsed and was renewed
   * without its subscriptions, which the caller must then `set()` again.
   */
  keepAlive?(): Promise<boolean>;
  /** Release resources (relay pools, etc). */
  destroy(): void;
}

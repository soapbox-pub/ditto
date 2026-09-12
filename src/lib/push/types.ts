/**
 * Push transport interface.
 *
 * Ditto has two ways to receive notifications while it is closed, and they
 * agree on nothing except that a `push` event ends up in the service worker:
 *
 * - **nostr-push** (`NostrPushAdapter`) — the Web Push path. A server holds the
 *   relay subscriptions, renders the notification text, and delivers it through
 *   the browser's push service. Needs VAPID, a `PushSubscription`, and the
 *   browser's own notification permission.
 * - **napp** (`NappPushAdapter`) — `window.napp.push`, injected by a host app
 *   (Tenna) that keeps the relay subscriptions open itself and hands the raw
 *   Nostr event to the worker. No server, no VAPID, no web-push permission;
 *   consent and OS permission are the host's business.
 *
 * Both are wrapped behind `PushAdapter` so `usePushNotifications` — and the
 * settings UI above it — never branches on which one is in play. Pick one with
 * `createPushAdapter()`; napp wins when the host provides it.
 */

import type { EncryptedSettings } from '@/hooks/useEncryptedSettings';

/** Per-type notification preferences, as persisted in encrypted settings. */
export type PushPreferences = NonNullable<EncryptedSettings['notificationPreferences']>;

/** Which transport an adapter speaks. Exposed for logging and diagnostics. */
export type PushTransport = 'napp' | 'nostr-push';

/**
 * Everything a transport needs to build (or rebuild) its subscriptions.
 *
 * `relays` and `follows` are only consulted by transports that do their own
 * relay subscribing — nostr-push resolves both server-side, where `$contacts`
 * stands in for the follow set.
 */
export interface PushContext {
  /** Hex pubkey of the logged-in user. Notifications are events tagging them. */
  pubkey: string;
  /** Per-type preferences. Absent means "everything, on". */
  prefs?: PushPreferences;
  /** Read relays to watch. */
  relays?: string[];
  /** The user's follow set, for the "only from people I follow" filter. */
  follows?: string[];
}

export interface PushAdapter {
  readonly transport: PushTransport;
  /** Whether this transport can run at all in the current environment. */
  readonly supported: boolean;
  /**
   * Whether the transport needs the caller to prompt for permission before
   * `enable()`. False when consent belongs to the host app (napp).
   */
  readonly needsBrowserPermission: boolean;
  /**
   * Whether the transport's subscriptions are built from the relay list and
   * follow set given here, and so go stale when either changes. False for
   * transports that resolve both server-side (nostr-push expands `$contacts`
   * itself), which are left alone unless preferences actually change.
   */
  readonly ownsSubscriptions: boolean;
  /**
   * One-time bring-up: register the service worker, restore prior state, and
   * pre-fetch anything `enable()` must not await (see `NostrPushAdapter`).
   * Resolves even when bring-up fails; `isEnabled()` then reports false.
   */
  init(): Promise<void>;
  /** Whether the transport currently has live subscriptions. */
  isEnabled(): Promise<boolean>;
  /**
   * Ask for whatever consent this transport requires. Must be reachable from a
   * user gesture. Returns the resulting permission state; `'granted'` for
   * transports that prompt elsewhere.
   */
  requestPermission(): Promise<NotificationPermission>;
  /** Subscribe. Call from a user gesture, after `requestPermission()`. */
  enable(context: PushContext): Promise<void>;
  /** Unsubscribe and forget any server- or host-side registration. */
  disable(): Promise<void>;
  /** Re-apply preferences to live subscriptions. No-op when not enabled. */
  sync(context: PushContext): Promise<void>;
  /** Release resources (relay pools, etc). */
  destroy(): void;
}

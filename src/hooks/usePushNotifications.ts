/**
 * usePushNotifications
 *
 * Drives the push notification lifecycle over whichever transport this
 * environment offers — `window.napp` when a host app provides it, Web Push via
 * nostr-push otherwise. See `src/lib/push/` for the adapters; nothing above
 * this hook needs to know which one is in play.
 *
 * - Selects and brings up an adapter on mount, restoring prior state.
 * - requestPermission(): asks for whatever consent the transport needs. Must be
 *   called from a user gesture, immediately before enable().
 * - enable(): subscribes, with filters built from the user's notification
 *   preferences, read relays, and follow set.
 * - disable(): tears the subscriptions down.
 */

import { useEffect, useRef, useCallback, useMemo, useState } from 'react';

import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useEncryptedSettings } from '@/hooks/useEncryptedSettings';
import { useFollowList } from '@/hooks/useFollowActions';
import { getEffectiveRelays } from '@/lib/appRelays';
import { createPushAdapter } from '@/lib/push';
import type { PushAdapter, PushPreferences, PushTransport } from '@/lib/push/types';

export interface UsePushNotificationsReturn {
  /** Current permission state, as far as the transport reports one. */
  permission: NotificationPermission;
  /** Whether push is currently active and registered. */
  enabled: boolean;
  /** Whether this environment supports push at all. */
  supported: boolean;
  /** Which transport was selected. */
  transport: PushTransport;
  /**
   * Ask for notification permission. Call from a user gesture, and only
   * proceed to enable() when this resolves 'granted'. Transports whose host
   * owns consent (napp) resolve 'granted' without prompting — their consent
   * prompt happens inside enable(), which rejects if the user declines.
   */
  requestPermission: () => Promise<NotificationPermission>;
  /** Subscribe. Caller must request permission first. */
  enable: (userPubkey: string, prefs?: PushPreferences) => Promise<void>;
  /** Unsubscribe and delete any server- or host-side registration. */
  disable: () => Promise<void>;
  /**
   * Re-apply notification preferences to live subscriptions.
   * Call when notification type preferences or onlyFollowing change.
   */
  syncPreferences: (prefs: PushPreferences, userPubkey: string) => Promise<void>;
}

export function usePushNotifications(): UsePushNotificationsReturn {
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const { settings } = useEncryptedSettings();
  const { data: followData } = useFollowList();

  // One adapter for the life of the hook. Transports are picked from globals
  // that don't change after load, so this never needs to re-select.
  const adapterRef = useRef<PushAdapter | null>(null);
  if (!adapterRef.current) {
    adapterRef.current = createPushAdapter();
  }
  const adapter = adapterRef.current;

  const [permission, setPermission] = useState<NotificationPermission>(() => {
    if (!adapter.needsBrowserPermission) return 'granted';
    return typeof Notification !== 'undefined' ? Notification.permission : 'default';
  });
  const [enabled, setEnabled] = useState(false);

  // Relays and follows are only used by transports that subscribe themselves,
  // but resolving them here keeps callers from having to.
  const relays = useMemo(() => {
    const { relays } = getEffectiveRelays(config.relayMetadata, config.useAppRelays, config.useUserRelays);
    return relays.filter((relay) => relay.read).map((relay) => relay.url);
  }, [config.relayMetadata, config.useAppRelays, config.useUserRelays]);

  const follows = useMemo(() => followData?.pubkeys ?? [], [followData?.pubkeys]);

  // Keep the latest values reachable from callbacks without rebuilding them.
  const contextRef = useRef({ relays, follows });
  contextRef.current = { relays, follows };

  // The preferences last pushed to the transport. Callers pass freshly toggled
  // preferences to syncPreferences() before the settings round-trip lands, so
  // this — not `settings` — is the newest version until it catches up.
  const prefsRef = useRef<PushPreferences | undefined>(undefined);

  // ─── Bring the adapter up on mount ────────────────────────────────────────

  useEffect(() => {
    if (!adapter.supported) return;

    let cancelled = false;

    (async () => {
      await adapter.init();
      if (cancelled) return;
      const active = await adapter.isEnabled();
      if (cancelled) return;
      if (active) {
        setEnabled(true);
        if (adapter.needsBrowserPermission) setPermission('granted');
      }
    })().catch((err) => {
      console.error('[push] Initialization failed:', err);
    });

    return () => {
      cancelled = true;
      adapter.destroy();
    };
  }, [adapter]);

  // ─── Actions ──────────────────────────────────────────────────────────────

  const requestPermission = useCallback(async () => {
    const result = await adapter.requestPermission();
    setPermission(result);
    return result;
  }, [adapter]);

  const enable = useCallback(async (userPubkey: string, prefs?: PushPreferences) => {
    if (!adapter.supported) return;
    const { relays, follows } = contextRef.current;
    prefsRef.current = prefs;
    await adapter.enable({ pubkey: userPubkey, prefs, relays, follows });
    setEnabled(true);
  }, [adapter]);

  const disable = useCallback(async () => {
    await adapter.disable();
    setEnabled(false);
  }, [adapter]);

  const syncPreferences = useCallback(async (prefs: PushPreferences, userPubkey: string) => {
    const { relays, follows } = contextRef.current;
    prefsRef.current = prefs;
    await adapter.sync({ pubkey: userPubkey, prefs, relays, follows });
  }, [adapter]);

  // ─── Keep locally-held subscriptions current ──────────────────────────────

  // A transport that holds its own subscriptions named the relays and follows
  // it had at subscribe time, and would keep watching them forever. Re-sync
  // when either changes — cheap, and it also advances the host's `since` so a
  // reconnect doesn't replay. Transports that resolve both server-side are
  // skipped so a settings mount doesn't re-send nine RPCs for nothing.
  const followsKey = useMemo(
    () => (follows.length > 0 ? follows.slice().sort().join(',') : ''),
    [follows],
  );
  const relaysKey = useMemo(() => relays.join(','), [relays]);

  useEffect(() => {
    if (!adapter.ownsSubscriptions || !enabled || !user) return;
    const prefs = prefsRef.current ?? settings?.notificationPreferences ?? undefined;
    const { relays, follows } = contextRef.current;
    adapter.sync({ pubkey: user.pubkey, prefs, relays, follows }).catch((err) => {
      console.error('[push] Failed to re-sync subscriptions:', err);
    });
    // `settings` is deliberately not a dependency: preference changes arrive
    // through syncPreferences(), and re-running on every settings revision
    // would resubscribe on unrelated edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adapter, enabled, user?.pubkey, followsKey, relaysKey]);

  return {
    permission,
    enabled,
    supported: adapter.supported,
    transport: adapter.transport,
    requestPermission,
    enable,
    disable,
    syncPreferences,
  };
}

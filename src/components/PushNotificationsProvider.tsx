/**
 * Owns the push transport for the whole app and keeps it current.
 *
 * - Selects and brings up a `PushAdapter` on mount, restoring prior state.
 * - Re-applies the subscriptions whenever what they're built from changes:
 *   the user, their notification preferences, read relays, or follow set.
 * - Native apps follow the synced `notificationsEnabled` setting (on unless
 *   switched off); elsewhere push is a per-device choice made in settings.
 * - Pings transports whose registration expires, on launch and on return.
 *
 * Renders its children. Must be mounted inside NostrProvider and
 * NostrLoginProvider.
 */

import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { PushNotificationsContext, type PushNotificationsContextType } from '@/contexts/PushNotificationsContext';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useEncryptedSettings } from '@/hooks/useEncryptedSettings';
import { useFollowList } from '@/hooks/useFollowActions';
import { getEffectiveRelays } from '@/lib/appRelays';
import { createPushAdapter } from '@/lib/push';
import type { PushContext, PushPreferences } from '@/lib/push/types';

export function PushNotificationsProvider({ children }: { children: ReactNode }) {
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const { settings, isLoading: settingsLoading } = useEncryptedSettings();
  const { data: followData } = useFollowList();

  // Picked from globals that don't change after load, so it never re-selects.
  // Brought up (and torn down) by the effect below.
  const [adapter] = useState(createPushAdapter);
  const [ready, setReady] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>(() => {
    if (!adapter.needsBrowserPermission) return 'granted';
    return typeof Notification !== 'undefined' ? Notification.permission : 'default';
  });

  const relays = useMemo(() => {
    const { relays } = getEffectiveRelays(config.relayMetadata, config.useAppRelays, config.useUserRelays);
    return relays.filter((relay) => relay.read).map((relay) => relay.url);
  }, [config.relayMetadata, config.useAppRelays, config.useUserRelays]);

  const follows = useMemo(() => followData?.pubkeys ?? [], [followData?.pubkeys]);
  const prefs = settings?.notificationPreferences ?? undefined;
  const style = settings?.notificationStyle ?? 'push';

  // Keep the latest context reachable from callbacks without rebuilding them.
  const contextRef = useRef<Omit<PushContext, 'pubkey'>>({});
  contextRef.current = { prefs, relays, follows, style };

  // ─── Bring the adapter up ─────────────────────────────────────────────────

  useEffect(() => {
    if (!adapter.supported) return;
    let cancelled = false;

    adapter.init().then(() => {
      if (cancelled) return;
      setReady(true);
      if (adapter.isEnabled()) {
        setEnabled(true);
        if (adapter.needsBrowserPermission) setPermission('granted');
      }
    }).catch((err) => {
      console.error('[push] Initialization failed:', err);
    });

    return () => {
      cancelled = true;
    };
  }, [adapter]);

  useEffect(() => () => adapter.destroy(), [adapter]);

  // ─── Actions ──────────────────────────────────────────────────────────────

  const requestPermission = useCallback(async () => {
    const result = await adapter.requestPermission();
    setPermission(result);
    return result;
  }, [adapter]);

  const enable = useCallback(async (userPubkey: string, prefsOverride?: PushPreferences) => {
    if (!adapter.supported) return;
    const context = contextRef.current;
    await adapter.enable({ ...context, prefs: prefsOverride ?? context.prefs, pubkey: userPubkey });
    setEnabled(true);
  }, [adapter]);

  const disable = useCallback(async () => {
    await adapter.disable();
    setEnabled(false);
  }, [adapter]);

  // ─── Keep the subscriptions current ───────────────────────────────────────

  // Stable content keys, so referentially-new arrays don't resubscribe.
  const followsKey = useMemo(() => follows.slice().sort().join(','), [follows]);
  const relaysKey = relays.join(',');
  const prefsKey = JSON.stringify(prefs ?? {});

  // Native: on/off is the synced setting. Wait for settings to load so the
  // first subscription doesn't briefly watch every type the user turned off.
  const nativeWanted = !!user && (settings?.notificationsEnabled ?? true);

  useEffect(() => {
    if (!ready || !adapter.followsSyncedSetting) return;
    if (user && settingsLoading) return;

    const run = nativeWanted && user
      ? adapter.enable({ ...contextRef.current, pubkey: user.pubkey }).then(() => setEnabled(true))
      : adapter.disable().then(() => setEnabled(false));

    run.catch((err) => console.error('[push] Failed to configure native notifications:', err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adapter, ready, nativeWanted, user?.pubkey, settingsLoading, followsKey, relaysKey, prefsKey, style]);

  // Everywhere else: push is turned on from settings, and once on, follows
  // whatever it is built from. The adapter skips a set that would change
  // nothing, so this costs nothing on an ordinary launch.
  useEffect(() => {
    if (!ready || adapter.followsSyncedSetting || !enabled || !user) return;
    adapter.sync({ ...contextRef.current, pubkey: user.pubkey }).catch((err) => {
      console.error('[push] Failed to re-sync subscriptions:', err);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adapter, ready, enabled, user?.pubkey, followsKey, relaysKey, prefsKey]);

  // Registrations that expire are pinged on launch and whenever Ditto comes
  // back to the foreground; the host rate-limits itself to once a day.
  useEffect(() => {
    if (!ready || !enabled || !user) return;
    const pubkey = user.pubkey;

    const keepAlive = () => {
      adapter.keepAlive({ ...contextRef.current, pubkey }).catch((err) => {
        console.warn('[push] Keep-alive failed:', err);
      });
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') keepAlive();
    };

    keepAlive();
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [adapter, ready, enabled, user]);

  const value = useMemo<PushNotificationsContextType>(() => ({
    permission,
    enabled,
    supported: adapter.supported,
    transport: adapter.transport,
    requestPermission,
    enable,
    disable,
  }), [permission, enabled, adapter, requestPermission, enable, disable]);

  return (
    <PushNotificationsContext.Provider value={value}>
      {children}
    </PushNotificationsContext.Provider>
  );
}

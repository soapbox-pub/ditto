import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';

import {
  useNativeNotifications,
  isIgnoringBatteryOptimizations,
  requestIgnoreBatteryOptimizations,
} from '@/hooks/useNativeNotifications';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useEncryptedSettings } from '@/hooks/useEncryptedSettings';
import { useToast } from '@/hooks/useToast';
import { ToastAction } from '@/components/ui/toast';

/**
 * Once-ever localStorage flag so the battery nudge doesn't nag on every
 * login. Declining is a valid choice — the warning in notification settings
 * remains available for users who change their mind.
 */
const BATTERY_NUDGE_KEY = 'ditto:battery-exemption-nudged';

/**
 * Side-effect component that initializes native device notifications.
 * Renders nothing. Must be mounted inside NostrProvider and NostrLoginProvider.
 *
 * Also surfaces the Android battery-optimization problem up front: when the
 * user is logged in with persistent notifications enabled but Ditto isn't
 * exempt from battery optimization (fresh install, settings synced from
 * another device), the background relay connection will silently die in
 * Doze. Rather than hiding that in settings, show a one-time toast with a
 * one-tap fix.
 */
export function NativeNotifications(): null {
  useNativeNotifications();

  const { user } = useCurrentUser();
  const { settings } = useEncryptedSettings();
  const { toast } = useToast();

  const notificationsEnabled = settings?.notificationsEnabled ?? true;
  const persistent = settings?.notificationStyle === 'persistent';

  useEffect(() => {
    if (Capacitor.getPlatform() !== 'android') return;
    if (!user || !notificationsEnabled || !persistent) return;
    if (localStorage.getItem(BATTERY_NUDGE_KEY)) return;

    let cancelled = false;

    (async () => {
      const exempt = await isIgnoringBatteryOptimizations();
      if (cancelled || exempt) return;

      localStorage.setItem(BATTERY_NUDGE_KEY, '1');
      toast({
        title: 'Notifications may be unreliable',
        description: (
          <div className="space-y-3">
            <p>
              Battery optimization can cut Ditto&rsquo;s background connection.
              Allow background usage for dependable notifications.
            </p>
            {/* Rendered below the text instead of in the side action slot,
                styled as a Ditto pill. ToastAction still auto-dismisses. */}
            <ToastAction
              altText="Allow background usage"
              onClick={() => {
                requestIgnoreBatteryOptimizations().catch(() => {});
              }}
              className="rounded-full px-5 h-9 border-transparent bg-primary text-primary-foreground font-medium transition-colors hover:bg-primary/90"
            >
              Allow background usage
            </ToastAction>
          </div>
        ),
        duration: 15_000,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [user, notificationsEnabled, persistent, toast]);

  return null;
}

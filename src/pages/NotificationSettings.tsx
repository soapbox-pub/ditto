import { useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { useSeoMeta } from '@unhead/react';
import { ArrowLeft, Bell, BellOff, AlertTriangle } from 'lucide-react';
import { Link, Navigate } from 'react-router-dom';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { HelpTip } from '@/components/HelpTip';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useEncryptedSettings } from '@/hooks/useEncryptedSettings';

export function NotificationSettings() {
  const { user } = useCurrentUser();
  const { config } = useAppContext();
  const { settings, updateSettings } = useEncryptedSettings();
  const [permission, setPermission] = useState<NotificationPermission>('default');

  useSeoMeta({
    title: `Notifications | Settings | ${config.appName}`,
    description: 'Configure your notification preferences',
  });

  // Check current browser permission state on mount
  useEffect(() => {
    if ('Notification' in window) {
      setPermission(Notification.permission);
    }
  }, []);

  // Persisted preference from encrypted settings
  const pushEnabled = settings?.notificationsEnabled ?? false;

  const handleTogglePush = async (enabled: boolean) => {
    if (enabled && !Capacitor.isNativePlatform()) {
      if (!('Notification' in window)) return;

      // Request browser permission first (no-op if already granted/denied)
      const result = await Notification.requestPermission();
      setPermission(result);

      // Don't save enabled=true if the browser blocked permission
      if (result !== 'granted') return;
    }

    // Persist the user's preference to encrypted settings (synced across devices)
    await updateSettings.mutateAsync({ notificationsEnabled: enabled });
  };

  if (!user) {
    return <Navigate to="/settings" replace />;
  }

  // Native platforms use the Java foreground service for notifications,
  // not the browser Notification API — always supported.
  const isNative = Capacitor.isNativePlatform();
  const isSupported = isNative || 'Notification' in window;
  const isDenied = !isNative && permission === 'denied';

  return (
    <main className="">
      {/* Header with back link */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center gap-4">
          <Link to="/settings" className="p-2 -ml-2 rounded-full hover:bg-secondary transition-colors">
            <ArrowLeft className="size-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold">Notifications</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Get push notifications for mentions, replies, and other activity.
            </p>
          </div>
        </div>
      </div>

      <div className="p-4">
        {/* Push notifications row */}
        <div className="border-b border-border last:border-b-0">
          <div className="flex items-center justify-between py-3.5 px-3">
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-muted-foreground shrink-0">
                {pushEnabled ? <Bell className="size-5" /> : <BellOff className="size-5" />}
              </span>
              <div className="min-w-0">
                <Label htmlFor="push-notifications" className="text-sm font-medium cursor-pointer">
                  Push Notifications
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                  Receive notifications for mentions, replies, and zaps <HelpTip faqId="what-are-zaps" iconSize="size-3.5" />
                </p>
              </div>
            </div>
            <Switch
              id="push-notifications"
              checked={pushEnabled}
              onCheckedChange={handleTogglePush}
              disabled={!isSupported || isDenied || updateSettings.isPending}
              className="shrink-0"
            />
          </div>

          {/* Status banners */}
          {!isSupported && (
            <div className="flex items-center gap-2 px-3 pb-3 text-muted-foreground">
              <AlertTriangle className="size-3.5 shrink-0" />
              <p className="text-xs">Your browser does not support push notifications.</p>
            </div>
          )}

          {isDenied && (
            <div className="flex items-center gap-2 px-3 pb-3 text-destructive">
              <AlertTriangle className="size-3.5 shrink-0" />
              <p className="text-xs">Notifications are blocked. Update your browser settings to allow notifications from this site.</p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

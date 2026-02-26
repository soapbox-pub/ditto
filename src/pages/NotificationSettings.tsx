import { useState, useEffect } from 'react';
import { useSeoMeta } from '@unhead/react';
import { ArrowLeft, Bell, BellOff } from 'lucide-react';
import { Link, Navigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useEncryptedSettings } from '@/hooks/useEncryptedSettings';

export function NotificationSettings() {
  const { user } = useCurrentUser();
  const { settings, updateSettings } = useEncryptedSettings();
  const [permission, setPermission] = useState<NotificationPermission>('default');

  useSeoMeta({
    title: 'Notifications | Settings | Ditto',
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
    if (enabled) {
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

  const isSupported = 'Notification' in window;
  const isDenied = permission === 'denied';

  return (
    <main className="min-h-screen">
      {/* Header with back link */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center gap-4">
          <Link to="/settings" className="p-2 -ml-2 rounded-full hover:bg-secondary transition-colors">
            <ArrowLeft className="size-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold">Notifications</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Configure push notification preferences
            </p>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Push notifications toggle */}
        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center size-10 rounded-full bg-secondary shrink-0">
                  {pushEnabled ? (
                    <Bell className="size-5 text-muted-foreground" />
                  ) : (
                    <BellOff className="size-5 text-muted-foreground" />
                  )}
                </div>
                <div>
                  <Label htmlFor="push-notifications" className="text-sm font-semibold cursor-pointer">
                    Push Notifications
                  </Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Receive notifications for mentions, replies, and zaps
                  </p>
                </div>
              </div>
              <Switch
                id="push-notifications"
                checked={pushEnabled}
                onCheckedChange={handleTogglePush}
                disabled={!isSupported || isDenied || updateSettings.isPending}
              />
            </div>

            {/* Status info */}
            {!isSupported && (
              <div className="flex items-center gap-2 px-1">
                <Badge variant="secondary" className="text-xs">
                  Not Supported
                </Badge>
                <p className="text-xs text-muted-foreground">
                  Your browser does not support push notifications.
                </p>
              </div>
            )}

            {isDenied && (
              <div className="flex items-center gap-2 px-1">
                <Badge variant="destructive" className="text-xs">
                  Blocked
                </Badge>
                <p className="text-xs text-muted-foreground">
                  Notifications are blocked. Update your browser settings to allow notifications from this site.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

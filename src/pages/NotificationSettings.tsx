import { useState, useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { useSeoMeta } from '@unhead/react';
import { Bell, BellOff, AlertTriangle, Heart, Repeat2, Zap, AtSign, MessageSquare, Users, Award, Mail } from 'lucide-react';
import { Navigate } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { Switch } from '@/components/ui/switch';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useEncryptedSettings } from '@/hooks/useEncryptedSettings';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { toast } from '@/hooks/useToast';

type NotificationPrefKey = 'reactions' | 'reposts' | 'zaps' | 'mentions' | 'comments' | 'badges' | 'letters';

interface NotificationTypeRow {
  key: NotificationPrefKey;
  label: string;
  kinds: number[];
  description: string;
  icon: React.ReactNode;
}

const NOTIFICATION_TYPES: NotificationTypeRow[] = [
  {
    key: 'reactions',
    label: 'Reactions',
    kinds: [7],
    description: 'When someone reacts to your posts',
    icon: <Heart className="size-5" />,
  },
  {
    key: 'reposts',
    label: 'Reposts',
    kinds: [6, 16],
    description: 'When someone reposts your notes',
    icon: <Repeat2 className="size-5" />,
  },
  {
    key: 'zaps',
    label: 'Zaps',
    kinds: [9735],
    description: 'When someone sends you a zap',
    icon: <Zap className="size-5" />,
  },
  {
    key: 'mentions',
    label: 'Mentions',
    kinds: [1],
    description: 'When someone mentions you in a note',
    icon: <AtSign className="size-5" />,
  },
  {
    key: 'comments',
    label: 'Comments & Replies',
    kinds: [1111],
    description: 'When someone comments on or replies to your posts',
    icon: <MessageSquare className="size-5" />,
  },
  {
    key: 'badges',
    label: 'Badge Awards',
    kinds: [8],
    description: 'When someone awards you a badge',
    icon: <Award className="size-5" />,
  },
  {
    key: 'letters',
    label: 'Letters',
    kinds: [8211],
    description: 'When someone sends you a letter',
    icon: <Mail className="size-5" />,
  },
];

function KindBadge({ kind }: { kind: number }) {
  return (
    <span className="text-[10px] font-mono text-muted-foreground/60 shrink-0">
      [{kind}]
    </span>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="relative px-3 py-3.5">
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary rounded-full" />
    </div>
  );
}

function NotifRow({
  icon,
  label,
  kinds,
  description,
  checked,
  onCheckedChange,
  disabled,
  noBorder,
}: {
  icon: React.ReactNode;
  label: string;
  kinds?: number[];
  description: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  disabled?: boolean;
  noBorder?: boolean;
}) {
  return (
    <div className={noBorder ? '' : 'border-b border-border last:border-b-0'}>
      <div className="flex items-center justify-between py-3.5 px-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-muted-foreground shrink-0">{icon}</span>
          <div className="min-w-0">
            <span className="text-sm font-medium">{label}</span>
            <p className="text-xs text-muted-foreground mt-0.5">
              {kinds?.map((k, i) => (
                <span key={k}>
                  <KindBadge kind={k} />{i < kinds.length - 1 ? ' ' : ' '}
                </span>
              ))}{description}
            </p>
          </div>
        </div>
        <div className="w-[52px] flex justify-center shrink-0">
          <Switch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
        </div>
      </div>
    </div>
  );
}

export function NotificationSettings() {
  const { user } = useCurrentUser();
  const { config } = useAppContext();
  const { settings, updateSettings } = useEncryptedSettings();
  const {
    enabled: pushHookEnabled,
    enable: enablePush,
    disable: disablePush,
    syncPreferences: syncPushPreferences,
  } = usePushNotifications();
  const [permission, setPermission] = useState<NotificationPermission>('default');

  const isNative = Capacitor.isNativePlatform();

  // Web: toggle reflects actual browser push subscription (from the hook).
  // Native: toggle reflects NIP-78 persisted preference.
  const [nativePushEnabled, setNativePushEnabled] = useState<boolean>(() => isNative);
  const [prefs, setPrefs] = useState<NonNullable<NonNullable<typeof settings>['notificationPreferences']>>({});
  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current || settings === null || settings === undefined) return;
    initializedRef.current = true;
    if (isNative) {
      setNativePushEnabled(settings.notificationsEnabled ?? true);
    }
    setPrefs(settings.notificationPreferences ?? {});
  }, [settings]);

  const pushEnabled = isNative ? nativePushEnabled : pushHookEnabled;

  useSeoMeta({
    title: `Notifications | Settings | ${config.appName}`,
    description: 'Configure your notification preferences',
  });

  useEffect(() => {
    if ('Notification' in window) {
      setPermission(Notification.permission);
    }
  }, []);

  const handleTogglePush = async (enabled: boolean) => {
    if (enabled && !isNative) {
      if (!('Notification' in window)) return;

      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== 'granted') return;

      // Register with nostr-push from this click handler (iOS requires
      // requestPermission + pushManager.subscribe from a user gesture).
      if (user) {
        try {
          await enablePush(user.pubkey, prefs);
        } catch (err) {
          console.error('[push] Registration failed:', err);
          toast({ title: 'Failed to enable notifications', description: 'Please try again.' });
          return; // Don't persist enabled=true if registration failed
        }
      }
      updateSettings.mutateAsync({ notificationsEnabled: true }).catch(() => {});
      return;
    }

    if (!enabled && !isNative) {
      await disablePush().catch((err) => console.error('[push] Failed to disable:', err));
      updateSettings.mutateAsync({ notificationsEnabled: false }).catch(() => {});
      return;
    }

    // Native path — toggle drives NIP-78 setting directly.
    setNativePushEnabled(enabled);
    updateSettings.mutateAsync({ notificationsEnabled: enabled }).catch(() => {
      setNativePushEnabled(!enabled); // roll back on failure
    });
  };

  const handleToggleType = (key: NotificationPrefKey, enabled: boolean) => {
    const next = { ...prefs, [key]: enabled };
    setPrefs(next);
    updateSettings.mutateAsync({ notificationPreferences: next }).catch(() => {
      setPrefs((p) => ({ ...p, [key]: !enabled })); // roll back on failure
    });
    // Sync the active/inactive state with the nostr-push server so disabled
    // types stop generating push notifications.
    if (pushEnabled && !isNative && user) {
      syncPushPreferences(next, user.pubkey).catch((err) => {
        console.error('[push] Failed to sync preferences:', err);
      });
    }
  };

  const handleToggleOnlyFollowing = (enabled: boolean) => {
    const next = { ...prefs, onlyFollowing: enabled };
    setPrefs(next);
    updateSettings.mutateAsync({ notificationPreferences: next }).catch(() => {
      setPrefs((p) => ({ ...p, onlyFollowing: !enabled })); // roll back on failure
    });
    // Sync the authors filter with nostr-push so $contacts is applied/removed
    if (pushEnabled && !isNative && user) {
      syncPushPreferences(next, user.pubkey).catch((err) => {
        console.error('[push] Failed to sync onlyFollowing preference:', err);
      });
    }
  };

  if (!user) {
    return <Navigate to="/settings" replace />;
  }

  const isSupported = isNative || 'Notification' in window;
  const isDenied = !isNative && permission === 'denied';

  return (
    <main className="">
      <PageHeader
        backTo="/settings"
        alwaysShowBack
        titleContent={
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold">Notifications</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Customize which notifications you receive.
            </p>
          </div>
        }
      />

      <div className="p-4">
        {/* Push Notifications */}
        <SectionHeader title="Push Notifications" />
        <div className="pb-4">
          <NotifRow
            icon={pushEnabled ? <Bell className="size-5" /> : <BellOff className="size-5" />}
            label="Enable Push Notifications"
            description="Receive notifications for activity on your posts"
            checked={pushEnabled}
            onCheckedChange={handleTogglePush}
            disabled={!isSupported || isDenied}
          />
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

        {/* Filter + Notify Me About — one continuous block */}
        <SectionHeader title="Notify Me About" />
        <div className="pb-4">
          {/* Filter sub-section */}
          <div className="px-3 pt-4 pb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Filter
            </span>
          </div>
          <NotifRow
            icon={<Users className="size-5" />}
            label="Only from people I follow"
            description="Hide notifications from accounts you don't follow"
            checked={prefs.onlyFollowing === true}
            onCheckedChange={handleToggleOnlyFollowing}
            noBorder
          />

          {/* Types sub-section */}
          <div className="px-3 pt-4 pb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Types
            </span>
          </div>
          {NOTIFICATION_TYPES.map((type) => (
            <NotifRow
              key={type.key}
              icon={type.icon}
              label={type.label}
              kinds={type.kinds}
              description={type.description}
              checked={prefs[type.key] !== false}
              onCheckedChange={(enabled) => handleToggleType(type.key, enabled)}
            />
          ))}
        </div>
      </div>
    </main>
  );
}

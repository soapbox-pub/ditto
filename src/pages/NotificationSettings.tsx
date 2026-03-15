import { useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { useSeoMeta } from '@unhead/react';
import { ArrowLeft, Bell, BellOff, AlertTriangle, Heart, Repeat2, Zap, AtSign, MessageSquare, Users } from 'lucide-react';
import { Link, Navigate } from 'react-router-dom';
import { Switch } from '@/components/ui/switch';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useEncryptedSettings } from '@/hooks/useEncryptedSettings';

type NotificationPrefKey = 'reactions' | 'reposts' | 'zaps' | 'mentions' | 'comments';

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
  const [permission, setPermission] = useState<NotificationPermission>('default');

  // Optimistic local state — updates instantly on toggle, persisted async
  const [localPushEnabled, setLocalPushEnabled] = useState<boolean | null>(null);
  const [localPrefs, setLocalPrefs] = useState<NonNullable<typeof settings>['notificationPreferences'] | null>(null);

  useSeoMeta({
    title: `Notifications | Settings | ${config.appName}`,
    description: 'Configure your notification preferences',
  });

  useEffect(() => {
    if ('Notification' in window) {
      setPermission(Notification.permission);
    }
  }, []);

  // Clear local state once the persisted settings have caught up
  useEffect(() => {
    if (localPushEnabled !== null && settings?.notificationsEnabled === localPushEnabled) {
      setLocalPushEnabled(null);
    }
  }, [settings?.notificationsEnabled, localPushEnabled]);

  useEffect(() => {
    if (localPrefs !== null && settings?.notificationPreferences === localPrefs) {
      setLocalPrefs(null);
    }
  }, [settings?.notificationPreferences, localPrefs]);

  // Use local optimistic value while it exists, fall back to persisted settings
  const pushEnabled = localPushEnabled ?? settings?.notificationsEnabled ?? true;
  const prefs = localPrefs ?? settings?.notificationPreferences ?? {};

  const handleTogglePush = async (enabled: boolean) => {
    if (enabled && !Capacitor.isNativePlatform()) {
      if (!('Notification' in window)) return;
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== 'granted') return;
    }
    setLocalPushEnabled(enabled);
    updateSettings.mutateAsync({ notificationsEnabled: enabled }).catch(() => {
      setLocalPushEnabled(null); // roll back on failure
    });
  };

  const handleToggleType = async (key: NotificationPrefKey, enabled: boolean) => {
    const next = { ...prefs, [key]: enabled };
    setLocalPrefs(next);
    updateSettings.mutateAsync({ notificationPreferences: next }).catch(() => {
      setLocalPrefs(null); // roll back on failure
    });
  };

  const handleToggleOnlyFollowing = async (enabled: boolean) => {
    const next = { ...prefs, onlyFollowing: enabled };
    setLocalPrefs(next);
    updateSettings.mutateAsync({ notificationPreferences: next }).catch(() => {
      setLocalPrefs(null); // roll back on failure
    });
  };

  if (!user) {
    return <Navigate to="/settings" replace />;
  }

  const isNative = Capacitor.isNativePlatform();
  const isSupported = isNative || 'Notification' in window;
  const isDenied = !isNative && permission === 'denied';

  return (
    <main className="">
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center gap-4">
          <Link to="/settings" className="p-2 -ml-2 rounded-full hover:bg-secondary transition-colors">
            <ArrowLeft className="size-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold">Notifications</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Customize which notifications you receive.
            </p>
          </div>
        </div>
      </div>

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
            disabled={!isSupported || isDenied || updateSettings.isPending}
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
            disabled={updateSettings.isPending}
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
              disabled={updateSettings.isPending}
            />
          ))}
        </div>
      </div>
    </main>
  );
}

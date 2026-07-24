import { useState, useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { useSeoMeta } from '@/hooks/useSeoMeta';
import { Bell, BellOff, AlertTriangle, ClipboardCheck, Heart, Quote, Repeat2, Zap, AtSign, MessageSquare, Users, Award, Mail, Radio, MonitorSmartphone } from 'lucide-react';
import { Navigate } from 'react-router-dom';
import { useIntl } from 'react-intl';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useEncryptedSettings } from '@/hooks/useEncryptedSettings';
import { isIgnoringBatteryOptimizations, requestIgnoreBatteryOptimizations } from '@/hooks/useNativeNotifications';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { toast } from '@/hooks/useToast';

type NotificationPrefKey = 'reactions' | 'reposts' | 'zaps' | 'mentions' | 'comments' | 'badges' | 'letters' | 'highlights' | 'quizzes';

interface NotificationTypeRow {
  key: NotificationPrefKey;
  kinds: number[];
  icon: React.ReactNode;
  label: string;
  description: string;
}

// English source strings live inline; ids resolve via `settings.notifications.type.<key>.*`.
const NOTIFICATION_TYPES: NotificationTypeRow[] = [
  {
    key: 'reactions',
    kinds: [7],
    icon: <Heart className="size-5" />,
    label: 'Reactions',
    description: 'When someone reacts to your posts',
  },
  {
    key: 'reposts',
    kinds: [6, 16],
    icon: <Repeat2 className="size-5" />,
    label: 'Reposts',
    description: 'When someone reposts your notes',
  },
  {
    key: 'zaps',
    kinds: [9735, 8333],
    icon: <Zap className="size-5" />,
    label: 'Zaps',
    description: 'When someone sends you a lightning or on-chain zap',
  },
  {
    key: 'mentions',
    kinds: [1],
    icon: <AtSign className="size-5" />,
    label: 'Mentions',
    description: 'When someone mentions you in a note',
  },
  {
    key: 'comments',
    kinds: [1111],
    icon: <MessageSquare className="size-5" />,
    label: 'Comments & Replies',
    description: 'When someone comments on or replies to your posts',
  },
  {
    key: 'badges',
    kinds: [8],
    icon: <Award className="size-5" />,
    label: 'Badge Awards',
    description: 'When someone awards you a badge',
  },
  {
    key: 'letters',
    kinds: [8211],
    icon: <Mail className="size-5" />,
    label: 'Letters',
    description: 'When someone sends you a letter',
  },
  {
    key: 'highlights',
    kinds: [9802],
    icon: <Quote className="size-5" />,
    label: 'Highlights',
    description: 'When someone highlights your content',
  },
  {
    key: 'quizzes',
    kinds: [7849],
    icon: <ClipboardCheck className="size-5" />,
    label: 'Quizzes',
    description: 'When someone takes your quiz',
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
  const intl = useIntl();
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
  const [notificationStyle, setNotificationStyle] = useState<'push' | 'persistent'>('push');
  const [prefs, setPrefs] = useState<NonNullable<NonNullable<typeof settings>['notificationPreferences']>>({});
  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current || settings === null || settings === undefined) return;
    initializedRef.current = true;
    if (isNative) {
      setNativePushEnabled(settings.notificationsEnabled ?? true);
      setNotificationStyle(settings.notificationStyle ?? 'push');
    }
    setPrefs(settings.notificationPreferences ?? {});
  }, [settings, isNative]);

  const pushEnabled = isNative ? nativePushEnabled : pushHookEnabled;

  const isAndroid = Capacitor.getPlatform() === 'android';

  // Battery optimization gets in the way of persistent mode: Android may cut
  // the background relay connection and (on Android 15+) blocks the service
  // from restarting after a reboot. When persistent mode is active, detect the
  // condition and offer a one-tap exemption request.
  const [batteryOptimized, setBatteryOptimized] = useState(false);

  useEffect(() => {
    if (!isAndroid || notificationStyle !== 'persistent' || !pushEnabled) {
      setBatteryOptimized(false);
      return;
    }

    let cancelled = false;
    const check = () => {
      isIgnoringBatteryOptimizations().then((ignoring) => {
        if (!cancelled) setBatteryOptimized(!ignoring);
      });
    };

    check();

    // Re-check when the user returns from the system exemption dialog.
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') check();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [isAndroid, notificationStyle, pushEnabled]);

  useSeoMeta({
    title: `${intl.formatMessage({ id: 'settings.notifications.title', defaultMessage: "Notifications" })} | ${intl.formatMessage({ id: 'settings.title', defaultMessage: "Settings" })} | ${config.appName}`,
    description: intl.formatMessage({ id: 'settings.notifications.metaDescription', defaultMessage: "Configure your notification preferences" }),
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
          toast({ title: intl.formatMessage({ id: 'settings.notifications.enableFailed', defaultMessage: "Failed to enable notifications" }), description: intl.formatMessage({ id: 'settings.notifications.enableFailedDescription', defaultMessage: "Please try again." }) });
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

  const handleStyleChange = (style: 'push' | 'persistent') => {
    const prev = notificationStyle;
    setNotificationStyle(style);
    updateSettings.mutateAsync({ notificationStyle: style }).catch(() => {
      setNotificationStyle(prev); // roll back on failure
    });

    // Surface the battery-optimization requirement up front: persistent mode
    // is unreliable without the exemption, so ask with the one-tap system
    // dialog the moment the user opts in (we're in a click handler, so the
    // gesture context is valid). Declining leaves the inline warning below
    // as the recovery path.
    if (style === 'persistent' && isAndroid) {
      isIgnoringBatteryOptimizations()
        .then((ignoring) => {
          if (ignoring) return;
          return requestIgnoreBatteryOptimizations().then((nowIgnoring) => {
            setBatteryOptimized(!nowIgnoring);
          });
        })
        .catch(() => {});
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
            <h1 className="text-xl font-bold">{intl.formatMessage({ id: 'settings.notifications.title', defaultMessage: "Notifications" })}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {intl.formatMessage({ id: 'settings.notifications.subtitle', defaultMessage: "Customize which notifications you receive." })}
            </p>
          </div>
        }
      />

      <div className="p-4">
        {/* Push Notifications */}
        <SectionHeader title={intl.formatMessage({ id: 'settings.notifications.pushTitle', defaultMessage: "Push Notifications" })} />
        <div className="pb-4">
          <NotifRow
            icon={pushEnabled ? <Bell className="size-5" /> : <BellOff className="size-5" />}
            label={intl.formatMessage({ id: 'settings.notifications.enablePush', defaultMessage: "Enable Push Notifications" })}
            description={intl.formatMessage({ id: 'settings.notifications.enablePushDescription', defaultMessage: "Receive notifications for activity on your posts" })}
            checked={pushEnabled}
            onCheckedChange={handleTogglePush}
            disabled={!isSupported || isDenied}
          />
          {!isSupported && (
            <div className="flex items-center gap-2 px-3 pb-3 text-muted-foreground">
              <AlertTriangle className="size-3.5 shrink-0" />
              <p className="text-xs">{intl.formatMessage({ id: 'settings.notifications.notSupported', defaultMessage: "Your browser does not support push notifications." })}</p>
            </div>
          )}
          {isDenied && (
            <div className="flex items-center gap-2 px-3 pb-3 text-destructive">
              <AlertTriangle className="size-3.5 shrink-0" />
              <p className="text-xs">{intl.formatMessage({ id: 'settings.notifications.blocked', defaultMessage: "Notifications are blocked. Update your browser settings to allow notifications from this site." })}</p>
            </div>
          )}
        </div>

        {/* Notification Style — Android only, visible when push is enabled.
            On iOS both modes use BGAppRefreshTask so the choice is meaningless. */}
        {isAndroid && pushEnabled && (
          <>
            <SectionHeader title={intl.formatMessage({ id: 'settings.notifications.deliveryMethod', defaultMessage: "Delivery Method" })} />
            <div className="pb-4">
              <p className="text-xs text-muted-foreground px-3 pt-3 pb-4">
                {intl.formatMessage({ id: 'settings.notifications.deliveryMethodDescription', defaultMessage: "Choose how notifications are delivered to your device." })}
              </p>
              <RadioGroup
                value={notificationStyle}
                onValueChange={(v) => handleStyleChange(v as 'push' | 'persistent')}
                className="px-3 space-y-3"
              >
                <div className="flex items-start gap-3">
                  <RadioGroupItem value="push" id="style-push" className="mt-0.5" />
                  <Label htmlFor="style-push" className="flex-1 cursor-pointer">
                    <div className="flex items-center gap-2">
                      <Radio className="size-4 text-muted-foreground" />
                      <span className="text-sm font-medium">{intl.formatMessage({ id: 'settings.notifications.stylePush', defaultMessage: "Push" })}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {intl.formatMessage({ id: 'settings.notifications.stylePushDescription', defaultMessage: "Standard notifications. No persistent status bar icon." })}
                    </p>
                  </Label>
                </div>
                <div className="flex items-start gap-3">
                  <RadioGroupItem value="persistent" id="style-persistent" className="mt-0.5" />
                  <Label htmlFor="style-persistent" className="flex-1 cursor-pointer">
                    <div className="flex items-center gap-2">
                      <MonitorSmartphone className="size-4 text-muted-foreground" />
                      <span className="text-sm font-medium">{intl.formatMessage({ id: 'settings.notifications.stylePersistent', defaultMessage: "Persistent" })}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {intl.formatMessage({ id: 'settings.notifications.stylePersistentDescription', defaultMessage: "Keeps a live relay connection open in the background so notifications arrive instantly. Use this for reliable delivery on devices without push notification support." })}
                    </p>
                  </Label>
                </div>
              </RadioGroup>

              {/* Battery optimization warning — persistent mode is unreliable
                  while Android is allowed to throttle Ditto in the background. */}
              {notificationStyle === 'persistent' && batteryOptimized && (
                <div className="mx-3 mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="size-4 shrink-0 text-amber-500 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs">
                        {intl.formatMessage({ id: 'settings.notifications.batteryWarning', defaultMessage: "Battery optimization is enabled for {appName}. Android may cut the background relay connection and prevent it from resuming after a reboot." }, { appName: config.appName })}
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-2 h-8 text-xs"
                        onClick={async () => {
                          // Resolves when the system dialog closes, with the
                          // fresh exemption state — update the banner right away.
                          const ignoring = await requestIgnoreBatteryOptimizations();
                          setBatteryOptimized(!ignoring);
                        }}
                      >
                        {intl.formatMessage({ id: 'settings.notifications.disableBatteryOptimization', defaultMessage: "Disable battery optimization" })}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* Filter + Notify Me About — one continuous block */}
        <SectionHeader title={intl.formatMessage({ id: 'settings.notifications.notifyMeAbout', defaultMessage: "Notify Me About" })} />
        <div className="pb-4">
          {/* Filter sub-section */}
          <div className="px-3 pt-4 pb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {intl.formatMessage({ id: 'settings.notifications.filter', defaultMessage: "Filter" })}
            </span>
          </div>
          <NotifRow
            icon={<Users className="size-5" />}
            label={intl.formatMessage({ id: 'settings.notifications.onlyFollowing', defaultMessage: "Only from people I follow" })}
            description={intl.formatMessage({ id: 'settings.notifications.onlyFollowingDescription', defaultMessage: "Hide notifications from accounts you don't follow" })}
            checked={prefs.onlyFollowing === true}
            onCheckedChange={handleToggleOnlyFollowing}
            noBorder
          />

          {/* Types sub-section */}
          <div className="px-3 pt-4 pb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {intl.formatMessage({ id: 'settings.notifications.types', defaultMessage: "Types" })}
            </span>
          </div>
          {NOTIFICATION_TYPES.map((type) => (
            <NotifRow
              key={type.key}
              icon={type.icon}
              label={intl.formatMessage({ id: `settings.notifications.type.${type.key}.label`, defaultMessage: type.label })}
              kinds={type.kinds}
              description={intl.formatMessage({ id: `settings.notifications.type.${type.key}.description`, defaultMessage: type.description })}
              checked={prefs[type.key] !== false}
              onCheckedChange={(enabled) => handleToggleType(type.key, enabled)}
            />
          ))}
        </div>
      </div>
    </main>
  );
}

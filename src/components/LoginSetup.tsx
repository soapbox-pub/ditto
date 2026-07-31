import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { BatteryCharging, Bell } from 'lucide-react';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { FormattedMessage } from 'react-intl';

import { Button } from '@/components/ui/button';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useEncryptedSettings } from '@/hooks/useEncryptedSettings';
import {
  isIgnoringBatteryOptimizations,
  requestIgnoreBatteryOptimizations,
} from '@/hooks/useNativeNotifications';
import { cn } from '@/lib/utils';

/**
 * The post-login setup flow.
 *
 * Everything a user has to answer after signing in on a native device — the OS
 * notification permission and (Android) the battery-optimization exemption —
 * used to arrive as two easy-to-miss interruptions: a raw system dialog fired
 * silently from a headless mount with no explanation, and an auto-dismissing
 * toast. This replaces them with one queue of full-screen steps in the signup
 * wizard's chrome: a progress bar, one question at a time, each with the context
 * needed to answer it, and each skippable.
 *
 * Steps are enqueued only when they actually apply, so a web user (or a native
 * user who has already granted everything) sees nothing at all. This mounts
 * inside {@link InitialSyncGate} only once sync/onboarding is complete, so it
 * never races those overlays.
 */

/** Steps, in the order they're offered. */
type StepId = 'notifications' | 'battery';

/**
 * Set once the notification step has been shown. Unlike the old launch-time OS
 * prompt (which re-fired every launch until the user answered at OS level), a
 * declined full-screen step is not re-asked — the Settings toggle is the way
 * back in.
 */
const NOTIF_PROMPT_KEY = 'ditto:notif-prompt-shown';

/**
 * Timestamp (ms) of the last battery-exemption nudge. Without the exemption,
 * Doze tears down the persistent relay connection that drives "persistent"
 * notification mode, and on Android 15+ the exemption is also required to
 * restart the foreground service after a reboot. Unlike the notification ask
 * this one re-nudges (it's recoverable and high-value), but no more than once
 * a day.
 */
const BATTERY_NUDGE_KEY = 'ditto:battery-exemption-nudged-at';
const NUDGE_INTERVAL_MS = 24 * 60 * 60 * 1000;

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // best-effort
  }
}

function batteryNudgeDue(): boolean {
  return Date.now() - (Number(read(BATTERY_NUDGE_KEY)) || 0) >= NUDGE_INTERVAL_MS;
}

/**
 * Whether the Android battery-optimization step should be offered right now.
 * Only relevant in "persistent" notification mode, which is the mode that holds
 * a live background relay connection Doze can kill.
 */
async function batteryStepApplies(persistent: boolean, notificationsEnabled: boolean): Promise<boolean> {
  if (Capacitor.getPlatform() !== 'android') return false;
  if (!persistent || !notificationsEnabled) return false;
  if (!batteryNudgeDue()) return false;
  return !(await isIgnoringBatteryOptimizations());
}

/** Request the OS notification permission. Returns whether it was granted. */
async function requestNotificationPermission(): Promise<boolean> {
  try {
    const { display } = await LocalNotifications.requestPermissions();
    return display === 'granted';
  } catch {
    return false;
  }
}

export function LoginSetup() {
  const { user } = useCurrentUser();
  const { settings } = useEncryptedSettings();

  const notificationsEnabled = settings?.notificationsEnabled ?? true;
  const persistent = settings?.notificationStyle === 'persistent';

  const [queue, setQueue] = useState<StepId[]>([]);
  const [completed, setCompleted] = useState(0);

  const enqueue = useCallback((id: StepId) => {
    setQueue((q) => (q.includes(id) ? q : [...q, id]));
  }, []);

  const advance = useCallback(() => {
    setQueue((q) => q.slice(1));
    setCompleted((c) => c + 1);
  }, []);

  // Probe the native permission steps once the user is in. Only native
  // platforms have anything to ask; web renders nothing.
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !user) return;
    let cancelled = false;
    (async () => {
      try {
        const { display } = await LocalNotifications.checkPermissions();
        if (cancelled) return;
        if (display !== 'granted') {
          // Only ask if the OS will still show its prompt and we haven't
          // already surfaced the step. A hard "denied" or a prior showing
          // sends the user to Settings instead.
          if (
            (display === 'prompt' || display === 'prompt-with-rationale') &&
            !read(NOTIF_PROMPT_KEY)
          ) {
            enqueue('notifications');
          }
          return;
        }
        // Already granted — the exemption is the only thing that may be missing.
        if (await batteryStepApplies(persistent, notificationsEnabled)) {
          if (!cancelled) enqueue('battery');
        }
      } catch {
        // Permission probe failed — offer nothing rather than guess.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, persistent, notificationsEnabled, enqueue]);

  const step = queue[0];

  // Record that a step was surfaced as it renders, so a user who force-quits
  // mid-flow isn't asked the same thing on every launch.
  useEffect(() => {
    if (step === 'notifications') write(NOTIF_PROMPT_KEY, '1');
    if (step === 'battery') write(BATTERY_NUDGE_KEY, String(Date.now()));
  }, [step]);

  if (!step) return null;

  const total = completed + queue.length;

  return (
    <WizardShell index={completed} total={total} stepKey={step}>
      {step === 'notifications' && (
        <NotificationsStep
          onDone={async (granted) => {
            // Granting is what makes the exemption matter, so chain straight
            // into it rather than waiting for the next launch to notice.
            if (granted && (await batteryStepApplies(persistent, notificationsEnabled))) {
              enqueue('battery');
            }
            advance();
          }}
        />
      )}
      {step === 'battery' && <BatteryStep onDone={advance} />}
    </WizardShell>
  );
}

/**
 * Full-screen wizard chrome matching {@link InitialSyncGate}'s signup flow: a
 * background takeover, a thin progress bar on top, and a centered, width-capped
 * column that fades/slides in per step. `stepKey` keys the column so React
 * remounts it and the enter animation replays between steps.
 */
function WizardShell({
  index,
  total,
  stepKey,
  children,
}: {
  index: number;
  total: number;
  stepKey: string;
  children: ReactNode;
}) {
  const pct = total > 0 ? ((index + 1) / total) * 100 : 100;
  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-background">
      <div className="h-1 bg-muted">
        <div
          className="h-full bg-primary transition-all duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex-1 flex flex-col overflow-y-auto">
        <div
          key={stepKey}
          className={cn(
            'w-full mx-auto my-auto px-6 py-12 max-w-md',
            'animate-in fade-in slide-in-from-right-4 duration-300',
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

/** The common step body: a brand glyph, a heading, a muted paragraph, actions. */
function StepBody({
  glyph,
  title,
  description,
  children,
}: {
  glyph: ReactNode;
  title: ReactNode;
  description: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-8 text-center">
      <div className="flex size-20 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        {glyph}
      </div>
      <div className="space-y-2.5">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  );
}

function NotificationsStep({ onDone }: { onDone: (granted: boolean) => void }) {
  const [busy, setBusy] = useState(false);

  const enable = async () => {
    setBusy(true);
    try {
      onDone(await requestNotificationPermission());
    } finally {
      setBusy(false);
    }
  };

  return (
    <StepBody
      glyph={<Bell className="size-9" />}
      title={<FormattedMessage id="loginSetup.notifications.title" defaultMessage="Stay in the loop" />}
      description={
        <FormattedMessage
          id="loginSetup.notifications.description"
          defaultMessage="Get notified about replies, mentions and reactions even when the app is closed."
        />
      }
    >
      <div className="w-full space-y-3">
        <Button
          size="lg"
          className="h-12 w-full rounded-full text-base font-medium"
          onClick={enable}
          disabled={busy}
        >
          <FormattedMessage id="loginSetup.notifications.enable" defaultMessage="Enable notifications" />
        </Button>
        <Button
          variant="ghost"
          className="w-full text-muted-foreground"
          onClick={() => onDone(false)}
          disabled={busy}
        >
          <FormattedMessage id="loginSetup.notNow" defaultMessage="Not now" />
        </Button>
      </div>
    </StepBody>
  );
}

function BatteryStep({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false);

  const allow = async () => {
    setBusy(true);
    try {
      await requestIgnoreBatteryOptimizations();
    } catch {
      // The OS dialog may be unavailable; the settings warning remains.
    } finally {
      setBusy(false);
      onDone();
    }
  };

  return (
    <StepBody
      glyph={<BatteryCharging className="size-9" />}
      title={<FormattedMessage id="loginSetup.battery.title" defaultMessage="Keep it connected" />}
      description={
        <FormattedMessage
          id="loginSetup.battery.description"
          defaultMessage="Android's battery optimization suspends Ditto's background connection, which silently stops notifications. Allowing background usage keeps them arriving."
        />
      }
    >
      <div className="w-full space-y-3">
        <Button
          size="lg"
          className="h-12 w-full rounded-full text-base font-medium"
          onClick={allow}
          disabled={busy}
        >
          <FormattedMessage id="loginSetup.battery.allow" defaultMessage="Allow background usage" />
        </Button>
        <Button
          variant="ghost"
          className="w-full text-muted-foreground"
          onClick={onDone}
          disabled={busy}
        >
          <FormattedMessage id="loginSetup.notNow" defaultMessage="Not now" />
        </Button>
      </div>
    </StepBody>
  );
}

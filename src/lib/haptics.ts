import { Capacitor } from '@capacitor/core';

/**
 * Centralized haptic feedback utility.
 *
 * On native (iOS/Android) it uses @capacitor/haptics for true taptic engine
 * feedback. On web it falls back to navigator.vibrate() which works on
 * Android browsers but is a silent no-op elsewhere.
 */

type ImpactStyle = 'Heavy' | 'Medium' | 'Light';
type NotificationType = 'Success' | 'Warning' | 'Error';

// Lazy-loaded Haptics plugin — only imported on native to avoid bundling
// the plugin in web builds where it isn't useful.
let hapticsPromise: Promise<typeof import('@capacitor/haptics')> | null = null;

function getHaptics() {
  if (!hapticsPromise) {
    hapticsPromise = import('@capacitor/haptics');
  }
  return hapticsPromise;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function nativeImpact(style: ImpactStyle) {
  const { Haptics, ImpactStyle } = await getHaptics();
  await Haptics.impact({ style: ImpactStyle[style] });
}

async function nativeNotification(type: NotificationType) {
  const { Haptics, NotificationType } = await getHaptics();
  await Haptics.notification({ type: NotificationType[type] });
}

async function nativeSelectionChanged() {
  const { Haptics } = await getHaptics();
  if (Capacitor.getPlatform() === 'android') {
    // Android: the plugin's selection sequence needs three sequential bridge
    // round-trips (selectionStart/selectionChanged/selectionEnd), each resolved
    // via evaluateJavascript on the UI thread, and its "selection" haptic is a
    // 100ms waveform buzz — together they visibly delay taps that navigate.
    // A single short one-shot vibration is one bridge call and feels like the
    // crisp tick this API is meant to produce.
    await Haptics.vibrate({ duration: 10 });
  } else {
    // iOS: maps to UISelectionFeedbackGenerator, which is cheap and crisp.
    await Haptics.selectionStart();
    await Haptics.selectionChanged();
    await Haptics.selectionEnd();
  }
}

function vibrate(ms: number) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* Vibration API not available */
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

function warnHapticError(label: string, err: unknown) {
  console.warn(`[haptics] ${label} failed:`, err);
}

/** Light tap — reactions, reposts, bookmarks, share. */
export function impactLight(): void {
  if (Capacitor.isNativePlatform()) {
    nativeImpact('Light').catch((e) => warnHapticError('impactLight', e));
  } else {
    vibrate(10);
  }
}

/** Medium tap — zap button press, pull-to-refresh threshold, follow. */
export function impactMedium(): void {
  if (Capacitor.isNativePlatform()) {
    nativeImpact('Medium').catch((e) => warnHapticError('impactMedium', e));
  } else {
    vibrate(20);
  }
}

/** Heavy tap — game button press, letter seal. */
export function impactHeavy(): void {
  if (Capacitor.isNativePlatform()) {
    nativeImpact('Heavy').catch((e) => warnHapticError('impactHeavy', e));
  } else {
    vibrate(30);
  }
}

/** Success notification — zap payment success, post published. */
export function notificationSuccess(): void {
  if (Capacitor.isNativePlatform()) {
    nativeNotification('Success').catch((e) => warnHapticError('notificationSuccess', e));
  } else {
    vibrate(15);
  }
}

/** Warning notification. */
export function notificationWarning(): void {
  if (Capacitor.isNativePlatform()) {
    nativeNotification('Warning').catch((e) => warnHapticError('notificationWarning', e));
  } else {
    vibrate(20);
  }
}

/** Error notification. */
export function notificationError(): void {
  if (Capacitor.isNativePlatform()) {
    nativeNotification('Error').catch((e) => warnHapticError('notificationError', e));
  } else {
    vibrate(30);
  }
}

/** Selection changed — toggle switches, tab taps, picker changes. */
export function selectionChanged(): void {
  if (Capacitor.isNativePlatform()) {
    nativeSelectionChanged().catch((e) => warnHapticError('selectionChanged', e));
  } else {
    vibrate(5);
  }
}

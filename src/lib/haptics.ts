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
  await Haptics.selectionChanged();
}

function vibrate(ms: number) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* Vibration API not available */
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

const isNative = Capacitor.isNativePlatform();

/** Light tap — reactions, reposts, bookmarks, share. */
export function impactLight(): void {
  if (isNative) {
    nativeImpact('Light').catch(() => {});
  } else {
    vibrate(10);
  }
}

/** Medium tap — zap button press, pull-to-refresh threshold, follow. */
export function impactMedium(): void {
  if (isNative) {
    nativeImpact('Medium').catch(() => {});
  } else {
    vibrate(20);
  }
}

/** Heavy tap — game button press, letter seal. */
export function impactHeavy(): void {
  if (isNative) {
    nativeImpact('Heavy').catch(() => {});
  } else {
    vibrate(30);
  }
}

/** Success notification — zap payment success, post published. */
export function notificationSuccess(): void {
  if (isNative) {
    nativeNotification('Success').catch(() => {});
  } else {
    vibrate(15);
  }
}

/** Warning notification. */
export function notificationWarning(): void {
  if (isNative) {
    nativeNotification('Warning').catch(() => {});
  } else {
    vibrate(20);
  }
}

/** Error notification. */
export function notificationError(): void {
  if (isNative) {
    nativeNotification('Error').catch(() => {});
  } else {
    vibrate(30);
  }
}

/** Selection changed — toggle switches, tab taps, picker changes. */
export function selectionChanged(): void {
  if (isNative) {
    nativeSelectionChanged().catch(() => {});
  } else {
    vibrate(5);
  }
}
